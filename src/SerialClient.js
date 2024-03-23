const fs = require('fs');
const os = require('os');
require('./Function.js');
const logFactory = require('./logFactory.js');
const { promisify } = require('util');
const { SerialPort } = require('serialport');
const { crc16_rev_update } = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter');
const { Transform } = require('stream');

const unsigned = _=>_>>>0;
const delay = (time, ...args) => new Promise(resolve=>setTimeout(resolve, time, ...args));

const CMD_DELIM = 0x53_54_45_56;
const motorBreakMsg = Uint8Array.from([
		0x53, 0x54, 0x45, 0x56, // Header/Delim
		0x31, 0x30,						  // CRC
		0x43,										// Motor Op Code
		0x0		    						  // Param 1
	]),
	motorStopMsg = Uint8Array.from([
		0x53, 0x54, 0x45, 0x56, // Header/Delim
		0xF0, 0xF0,						  // CRC
		0x43,										// Motor Op Code
		0x1		    						  // Param 1
	]),
	motorCCWMsg = Uint8Array.from([
		0x53, 0x54, 0x45, 0x56, // Header/Delim
		0xB0, 0xF1,						  // CRC
		0x43,										// Motor Op Code
		0x2		    						  // Param 1
	]),
	motorCWMsg = Uint8Array.from([
		0x53, 0x54, 0x45, 0x56, // Header/Delim
		0x71, 0x31,						  // CRC
		0x43,										// Motor Op Code
		0x3		    						  // Param 1
	]);

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
  const hashCode = '#'.charCodeAt(0),
		newline = '\n'.charCodeAt(0),
		linereturn = '\r'.charCodeAt(0);
	let comment = '',
		result = new Uint8Array(msg.length)
		j = 0;

	for(let i=0,c='',t=''; i<msg.length; i++) {
		c = msg[i];
		if(c === hashCode) {
			c = msg[++i];
			if(c === hashCode) {
				for(++i; i<msg.length; i++){
					c = msg[i];
					if(c === newline || c === linereturn){
						i++;
						break;
					}
					comment += String.fromCharCode(c);
				}
			}
		}
		result[j++] = c;
	}
	if(comment) commentCallback(comment);
  return result.slice(0, j);
}

module.exports.unsigned = unsigned;
module.exports.toBigEndianWord = toBigEndianWord;
module.exports.to16bitWord = to16bitWord;
module.exports.swapEndian = swapEndian;
module.exports.crc16_rev_update =  crc16_rev_update;

class InvalidMessage extends Error {}

module.exports.SerialClient = class SerialClient {
  static #DEFAULT_BAUD_RATE = 9600;
  static #BUFFER_CLEAR_DELAY = 5;
  static #INITIALIZE_TIMEOUT = 5000;
	static #MAX_BAD_MESSAGES = 5;
  static #RESPONSE_WAIT_TIMEOUT = 60000;
  static #DEFAULT_PATH = '/dev/ttyACM0';
  static #DEFAULT_LOGGER = logFactory.createLogger('SerialClient:DefaultLogger');
  static #MESSAGE_BUFFER_SIZE = 24; //24bytes; 8 16bit words (16 bytes) IR readings, 1 16bit word (2 bytes) extra data, 1 16bit word (2 bytes) CRC, 2 16bit word (4 bytes) footer
  static #MSG_CRC_LOW_BYTE = 18;
  static #MSG_CRC_HIGH_BYTE = 19;
  static #CONTENT_SZ = 18; // bytes
	static #MSG_DELIM = Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]);

	static InvalidMessage = InvalidMessage;

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
						let badMessageCount = 0;
						const client = new SerialClient(port);
						const logger = logFactory.createLogger(`SerialClient:${port}`);
						const initTimeout = setTimeout(()=>{
							client.close();
							reject({client, port, err:`'${port}' took to long to respond.`});
						}, SerialClient.#INITIALIZE_TIMEOUT);
						const errHandler = (err) => {
							if(err instanceof SerialClient.InvalidMessage && badMessageCount < SerialClient.#MAX_BAD_MESSAGES){
								badMessageCount++;
							}else{
								clearTimeout(initTimeout);
								client.close();
								reject({client, port, err});
							}
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
          callback(null, stripComments(chunk, c=>{
						self.logger.debug('Comments \'%s\'', c.replaceAll('\r', '').replaceAll('\n',''));
					}));
        }
      }),
      delimiterParser = new DelimiterParser({
        delimiter:        SerialClient.#MSG_DELIM,
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
        else resolve(this);
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
		}else{
			this._errorHandler(new InvalidMessage('Recieved invalid message'));
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
  const DEFAULT_LOGGER = logFactory.createLogger('Test1');
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
    if(err) return DEFAULT_LOGGER.error(err.message);
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
  const DEFAULT_LOGGER = logFactory.createLogger('Test2');
  const client = new module.exports.SerialClient();
  client.addErrorHandler(console.error);
  client.addMsgHandler(m=>console.log(m.toString()));
	DEFAULT_LOGGER.log('Sending a msg');
  client.send('Hello hardware!!').catch(DEFAULT_LOGGER.error);
}

function test_3() {
  const DEFAULT_LOGGER = logFactory.createLogger('Test3');
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

function test_5() {
	module.exports.SerialClient.getSerials().then(async function(clients) {
		if(!clients.length) return;
		const client = clients[0];
		client.addMsgHandler(m=>console.log(m.toString()));
		for(let i=0; i<100; i++){
			await client.send.delay(client, 100, motorCCWMsg);
			await client.send.delay(client, 100, motorCWMsg);
			console.log(i);
		}
		await delay(2000);
		clients.forEach(c=>c.close());
	});
}

function test_6() {
	// Testing IR data
	const ADS1_PIN_0_IDX =  0, //1
				ADS1_PIN_1_IDX =  2, //3
				ADS1_PIN_2_IDX =  4, //5
				ADS1_PIN_3_IDX =  6, //7
				ADS2_PIN_0_IDX =  8, //9
				ADS2_PIN_1_IDX = 10, //11
				ADS2_PIN_2_IDX = 12, //13
				ADS2_PIN_3_IDX = 14, //15
				EXTRA_BITS_IDX = 16; //17
	module.exports.SerialClient.getSerials().then(async function(clients) {
		const client = clients[0];
		client.addMsgHandler(msg=> {
			// (msg[ADS1_PIN_0_IDX] << 8) | msg[ADS1_PIN_0_IDX + 1] 
			console.log(
				reconst(msg, ADS1_PIN_0_IDX).toString(16),
				reconst(msg, ADS1_PIN_1_IDX).toString(16),
				reconst(msg, ADS1_PIN_2_IDX).toString(16),
				reconst(msg, ADS1_PIN_3_IDX).toString(16),
				reconst(msg, ADS2_PIN_0_IDX).toString(16),
				reconst(msg, ADS2_PIN_1_IDX).toString(16),
				reconst(msg, ADS2_PIN_2_IDX).toString(16),
				reconst(msg, ADS2_PIN_3_IDX).toString(16)
			);
		});
		await delay(5000);
		clients.forEach(c=>c.close());
	});

	function reconst(msg, idx) {
		return (msg[idx] << 8) | msg[idx + 1];
	}
}

function test_7() {
	// Testing Extra data
	const EXTRA_BITS_IDX = 16; //17
	const MOTOR_OVERCURRENT_BIT = 0,
				DOOR_SWITCH_BIT       = 1,
				MOTOR_LIMIT_ONE_BIT   = 2,
				MOTOR_LIMIT_TWO_BIT   = 3;

	module.exports.SerialClient.getSerials().then(async function(clients) {
		const client = clients[0];
		client.addMsgHandler(msg=> {
			const fullByte = (msg[EXTRA_BITS_IDX] << 8) | msg[EXTRA_BITS_IDX + 1];
			console.log(
				'Full byte: ' + fullByte.toString(16) + '\n\t',
				'Overcurrent set: ' + Boolean(((fullByte >>> MOTOR_OVERCURRENT_BIT) & 1)) + '\n\t',
				'Door switch set: ' + Boolean(((fullByte >>> DOOR_SWITCH_BIT) & 1)) + '\n\t',
				'Motor Limit 1: ' + Boolean(((fullByte >>> MOTOR_LIMIT_ONE_BIT) & 1)) + '\n\t',
				'Motor Limit 2: ' + Boolean(((fullByte >>> MOTOR_LIMIT_TWO_BIT) & 1)),
			);
		});
		await delay(5000);
		clients.forEach(c=>c.close());
	});
}

function test_8() {
	// Testing all data
	const ADS1_PIN_0_IDX =  0, //1
				ADS1_PIN_1_IDX =  2, //3
				ADS1_PIN_2_IDX =  4, //5
				ADS1_PIN_3_IDX =  6, //7
				ADS2_PIN_0_IDX =  8, //9
				ADS2_PIN_1_IDX = 10, //11
				ADS2_PIN_2_IDX = 12, //13
				ADS2_PIN_3_IDX = 14; //15
	const EXTRA_BITS_IDX = 16; //17
	const MOTOR_OVERCURRENT_BIT = 0,
				DOOR_SWITCH_BIT       = 1,
				MOTOR_LIMIT_ONE_BIT   = 2,
				MOTOR_LIMIT_TWO_BIT   = 3;

	module.exports.SerialClient.getSerials().then(async function(clients) {
		const client = clients[0];
		client.addMsgHandler(msg=> {
			const fullByte = (msg[EXTRA_BITS_IDX] << 8) | msg[EXTRA_BITS_IDX + 1];
			console.log(
				'IR \n\t', 
				'ADS1 pin 0: ' + reconst(msg, ADS1_PIN_0_IDX).toString(16) + '\n\t',
				'ADS1 pin 1: ' + reconst(msg, ADS1_PIN_1_IDX).toString(16) + '\n\t',
				'ADS1 pin 2: ' + reconst(msg, ADS1_PIN_2_IDX).toString(16) + '\n\t',
				'ADS1 pin 3: ' + reconst(msg, ADS1_PIN_3_IDX).toString(16) + '\n\n\t',
				'ADS2 pin 0: ' + reconst(msg, ADS2_PIN_0_IDX).toString(16) + '\n\t',
				'ADS2 pin 1: ' + reconst(msg, ADS2_PIN_1_IDX).toString(16) + '\n\t',
				'ADS2 pin 2: ' + reconst(msg, ADS2_PIN_2_IDX).toString(16) + '\n\t',
				'ADS2 pin 3: ' + reconst(msg, ADS2_PIN_3_IDX).toString(16) + '\n',

				'Full extra byte: ' + fullByte.toString(16) + '\n\t',
				'Overcurrent set: ' + Boolean(((fullByte >>> MOTOR_OVERCURRENT_BIT) & 1)) + '\n\t',
				'Door switch set: ' + Boolean(((fullByte >>> DOOR_SWITCH_BIT) & 1)) + '\n\t',
				'Motor Limit 1: ' + Boolean(((fullByte >>> MOTOR_LIMIT_ONE_BIT) & 1)) + '\n\t',
				'Motor Limit 2: ' + Boolean(((fullByte >>> MOTOR_LIMIT_TWO_BIT) & 1))
			);
		});
		await delay(5000);
		clients.forEach(c=>c.close());
	});
	function reconst(msg, idx) {
		return (msg[idx] << 8) | msg[idx + 1];
	}
}

if(process.argv[0] === __filename || process.argv[1] === __filename) {
  test_8();
}
