const fs = require('fs');
const os = require('os');
const logFactory = require('./logFactory.js');
const { promisify } = require('util');
const { SerialPort } = require('serialport');
const { crc16_rev_update } = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter');
const { Transform } = require('stream');

const unsigned = _=>_>>>0;

function toBigEndianWord(msg) {
  let m = new Uint16Array(msg.length/2);
  for(let i=0, mi=0; i<msg.length; i+=2) {
    m[mi++] = (msg[i+1] << 8) | msg[i];
  }
  return m;
}

function to16bitWord(msg) {
  let m = new Uint16Array(msg.length/2);
  for(let i=0, mi=0; i<msg.length; i+=2) {
    m[mi++] = (msg[i] << 8) | msg[i+1];
  }
  return m;
}

function swapEndian(msg) {
  let converted = Uint8Array.from(msg);
  for(let i=0, tmp; i<converted.length; i+=2) {
    tmp = converted[i+1];
    converted[i+1] = converted[i];
    converted[i] = tmp;
  }
  return converted;
}

/*
Comments are in the form
# Some text \n
This function only works on char arrays.
 */
function stripComments(msg, commentCallback) {
  const KEEP = true,
			  REMOVE = false;
  let state = KEEP,
    hashCode = '#'.charCodeAt(0),
    newline = '\n'.charCodeAt(0),
    comment = '';

  return msg.filter(c => {
    if(state === KEEP && c === hashCode) {
      state = REMOVE;
    }else if(c === newline) {
      state = KEEP;
      commentCallback(comment);
      return REMOVE; //Remove the  newline
    }
    if(state === REMOVE) {
      comment += String.fromCharCode(c);
    }
    return state;
  });
}

module.exports.SerialClient = class SerialClient {
  static #DEFAULT_BAUD_RATE = 9600;
  static #BUFFER_CLEAR_DELAY = 5;
  static #INITIALIZE_TIMEOUT = 5000;
  static #RESPONSE_WAIT_TIMEOUT = 60000;
  static #DEFAULT_PATH = '/dev/ttyACM0';
  static #DEFAULT_LOGGER = logFactory.createLogger('SerialClient');
  static #MESSAGE_BUFFER_SIZE = 24; //24bytes; 8 16bit words (16 bytes) IR readings, 1 16bit word (2 bytes) extra data, 1 16bit word (2 bytes) CRC, 2 16bit word (4 bytes) footer
  static #MSG_CRC_LOW_BYTE = 18;
  static #MSG_CRC_HIGH_BYTE = 19;
  static #CONTENT_SZ = 18; // bytes

	/*
		returns the path to the simulated ham, or null if there isn't one
	*/
	static async getCarPort() {
		return new Promise((resolve) => {
			fs.realpath(os.homedir() + '/carport', (err, path) => resolve(path));
		});
	}

	static async getDevices() {
		let ports = await SerialPort.list();
		let simport = await SerialClient.getCarPort();
		let paths = ports.map((f) => f.path);
		if (simport) paths.push(simport);
		return paths;
	}

	static async getSerials() {
		return SerialClient.getDevices().then((ports) => {
			SerialClient.#DEFAULT_LOGGER.warn(ports);
			return Promise.allSettled(
				ports.map((port) => {
					return new Promise((resolve, reject) => {
						const client = new SerialClient(port);
						const logger = logFactory.createLogger(`SerialClient:${port}`);
						const initTimeout = setTimeout(()=>{
							client.close();
							reject({client, port, err:`'${port}' took to long to respond.`});
						}, SerialClient.#INITIALIZE_TIMEOUT);
						const errHandler = (err) => {
							clearTimeout(initTimeout);
							client.close();
							reject({client, port, err});
						};
						const msgHandler = (msg) => {
							clearTimeout(initTimeout);
							client.removeMsgHandler(msgHandler);
							client.removeErrorHandler(errHandler);
							logger.info('Recieved a valid msg \'%s\'', msg);
							resolve(client);
						};

						client
							.setLogger(logger)
							.addErrorHandler(errHandler)
							.addMsgHandler(msgHandler);
					});
				})
			).then((promises) => {
				return promises.filter((promise) => promise.status === 'fulfilled').map((prommy) => prommy.value);
			});
		});
	}

	static isValidMessage(msgBuffer) {
		let crc = 0,
			msgCRC = ((msgBuffer[SerialClient.#MSG_CRC_LOW_BYTE]<<8) | msgBuffer[SerialClient.#MSG_CRC_HIGH_BYTE]);

		//The pipe transform swaps endian, need to swap it back to check crc.
		for(let i=0; i < SerialClient.#CONTENT_SZ; i+=2) {
			crc = crc16_rev_update(crc, msgBuffer[i+1]);
			crc = crc16_rev_update(crc, msgBuffer[i]);
		}

		return crc === msgCRC;
	}

  constructor(portPath=SerialClient.#DEFAULT_PATH, autoOpen=true) {
    this.port = null;
    this.parser = null;
    this.autoOpen = autoOpen;
    this.portPath = portPath || SerialClient.#DEFAULT_PATH;
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.logger = SerialClient.#DEFAULT_LOGGER;

    this.setup();
  }

  setup() {
    const self = this;
    const swapEndianTransform = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, swapEndian(chunk));
        }
      }),
      removeComments = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, stripComments(chunk, c=>{self.logger.debug('Comment: \'', c, '\'');}));
        }
      }),
      delimiterParser = new DelimiterParser({
        delimiter:        Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]),
        includeDelimiter: true
      });

    this.port = new SerialPort({
      path:     this.portPath,
      baudRate: SerialClient.#DEFAULT_BAUD_RATE,
      autoOpen: this.autoOpen
    },
    this._portOpenHandler.bind(this)
    );
    this.port.on('error', this._errorHandler.bind(this));

    this.parser = this.port
										  .pipe(delimiterParser)
										  .pipe(removeComments)
									    .pipe(swapEndianTransform);
    this.parser.on('data', this._dataHandler.bind(this));
  }

  open() {
    let popen = promisify(this.port.open.bind(this.port));
    return popen().catch( (err) => {
      this._portOpenHandler(err);
      throw err;
    });
  }

	close() {
		if(this.port.isOpen) this.port.close();
		return this;
	}

  send(msg) {
    return new Promise((resolve, reject)=> {
      //port.write - Returns false if the stream wishes for the calling code to wait for the drain event to be emitted before continuing to write additional data; otherwise true.
      this.port.write(Buffer.from(msg));
      this.port.drain((err)=> {
        if(err) reject(err);
        else resolve(msg);
      });
    });
  }

  write(msg) {
    return this.port.write(Buffer.from(msg));
  }

  addMsgHandler(handler) {
    this.messageHandlers.push(handler);
    return this;
  }

  removeMsgHandler(handler) {
    return this._removeHandler(this.messageHandlers, handler);
  }

  addErrorHandler(handler) {
    this.errorHandlers.push(handler);
    return this;
  }

  removeErrorHandler(handler) {
    return this._removeHandler(this.errorHandlers, handler);
  }

  setLogger(l) {
    this.logger = l;
    return this;
  }

  _removeHandler(array, handler) {
    let i = array.indexOf(handler);
    if(i >= -1) {
      return array.splice(i, 1);
    }
    return null;
  }

  _portOpenHandler(err) {
    if(err) this._errorHandler(err);
  }

  _dataHandler(msg) {
		if(SerialClient.isValidMessage(msg)) {
			this.messageHandlers.forEach(mh=>{
				mh.apply(mh, arguments);
			});
		}
    return this;
  }

  _errorHandler() {
    this.errorHandlers.forEach(eh=>{
      eh.apply(eh, arguments);
    });
    return this;
  }
};

function test_1() {
  const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');
  const swapEndianTransform = new Transform({
      transform(chunk, encoding, callback) {
        callback(null, swapEndian(chunk));
      }
    }),
    removeComments = new Transform({
      transform(chunk, encoding, callback) {
        callback(null, stripComments(chunk, (c)=>{process.stderr.write(c + '\n');}));
      }
    });
  delimiterParser = new DelimiterParser({
    delimiter:        Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]),
    includeDelimiter: true
  }
  );

  function openErrorHandler(err) {
    if(err) return DEFAULT_LOGGER.error('Error: ', err.message);
  }

  const port = new SerialPort({
    path:     '/dev/ttyACM0', baudRate: 9600,
    autoOpen: false
  },
  openErrorHandler
  );
  const parser = port.pipe(delimiterParser).pipe(removeComments).pipe(swapEndianTransform);

  //port.open(openErrorHandler);
  let popen = promisify(port.open.bind(port));
  popen().then(()=>{
    DEFAULT_LOGGER.log('Port open!');
    port.write(Buffer.from('Written from popen'));
  }).catch(DEFAULT_LOGGER.error);

  port.on('open', (msg)=>{
    DEFAULT_LOGGER.log('On open called');
    port.write(Buffer.from('Written from port.on.open'));
  });
  port.on('error', (err)=> {
    if(err) DEFAULT_LOGGER.error('port.on.error %s', err);
  });

  parser.on('data', (msg)=>{
    console.log(msg.toString());
  });
  // port.on('readable', function () {
  //   console.log('Data:', port.read().toString());
  // })
  // var wrtRtn = port.write('Hi Mom!');
  // DEFAULT_LOGGER.debug('write result %s', wrtRtn);
  // wrtRtn = port.write(Buffer.from('Hi Mom!'));
  // DEFAULT_LOGGER.debug('write result %s', wrtRtn);


  function sendInterval() {
    wrtRtn = port.write(Buffer.from('setTimeout'));
    DEFAULT_LOGGER.debug('write result %s', wrtRtn);
    port.drain((err)=>{
      if(err) DEFAULT_LOGGER.error(err);
      DEFAULT_LOGGER.debug('drained');
      setTimeout(sendInterval, 1000);
    });
  }
  sendInterval();
}

function test_2() {
  const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');
  const client = new module.exports.SerialClient();
  client.addErrorHandler(console.error);
  client.addMsgHandler(m=>console.log(m.toString()));
	DEFAULT_LOGGER.log('Sending a msg');
  client.send('Hello hardware!!').catch(DEFAULT_LOGGER.error);
}

function test_3() {
  const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');
  const client = new module.exports.SerialClient('/dev/ttyACM0', false);
  client.addErrorHandler(console.error);
  client.addMsgHandler(m=>console.log(m.toString()));
  client.open().then(()=>{
		return new Promise(resolve=>{
			DEFAULT_LOGGER.log('Delaying send');
			setTimeout(resolve, 2000);
		});
  }).then(()=>{
		DEFAULT_LOGGER.log('Msg sent');
		client.send('Omfg hello world').catch(DEFAULT_LOGGER.error);
	});
}

function test_4() {
	module.exports.SerialClient.getSerials().then((clients)=>{
		clients.forEach(c=>c.close());
	});
}

if(process.argv[0] === __filename || process.argv[1] === __filename) {
  test_4();
}
