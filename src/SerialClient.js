const fs = require('fs');
const os = require('os');
require('./Function.js');
const logFactory = require('./logFactory.js');
const { promisify } = require('util');
const { SerialPort } = require('serialport');
const { crc16_rev_update } = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter');
const { Transform } = require('stream');

const MAX_STRIP_LENGTH = 120;

const unsigned = _=>_>>>0;
const HIGH = _=>unsigned(_)&0xFF;
const LOW = _=>_>>>8;

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

const createNeoPixelMsg = (start=0, count=MAX_STRIP_LENGTH, red=0, green=0, blue=0, stripLength=MAX_STRIP_LENGTH) => {
  const msg = Uint8Array.from([
    0x53, 0x54, 0x45, 0x56, // Header/Delim
    0x00, 0x00,						  // CRC
    0x49,										// Pixel Op Code
		stripLength,  					// Strip length
		start,								  // Start index
		count,									// Count
    red,       						  // Red
		green,								  // Green
		blue									  // Blue
  ]);
	let crc = crc16_rev_update(0, msg[6]);
	crc = crc16_rev_update(crc, msg[7]);
	crc = crc16_rev_update(crc, msg[8]);
	crc = crc16_rev_update(crc, msg[9]);
	crc = crc16_rev_update(crc, msg[10]);
	crc = crc16_rev_update(crc, msg[11]);
	crc = crc16_rev_update(crc, msg[12]);
	msg[4] = unsigned(crc) & 0xFF;
	msg[5] = crc >>> 8;
	return msg;
};

module.exports.motorBreakMsg = motorBreakMsg;
module.exports.motorStopMsg = motorStopMsg;
module.exports.motorCCWMsg = motorCCWMsg;
module.exports.motorCWMsg = motorCWMsg;
module.exports.createNeoPixelMsg = createNeoPixelMsg;


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
    result = new Uint8Array(msg.length);
  j = 0;

  for(let i=0, c='', t=''; i<msg.length; i++) {
    c = msg[i];
    if(c === hashCode) {
      c = msg[++i];
      if(c === hashCode) {
        for(++i; i<msg.length; i++) {
          c = msg[i];
          if(c === newline || c === linereturn) {
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

class InvalidMessage extends Error{}
module.exports.InvalidMessage = InvalidMessage;

module.exports.SerialClient = class SerialClient{
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
              reject({client, port, err: `'${port}' took to long to respond.`});
            }, SerialClient.#INITIALIZE_TIMEOUT);
            const errHandler = (err) => {
              if(err instanceof SerialClient.InvalidMessage && badMessageCount < SerialClient.#MAX_BAD_MESSAGES) {
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
            self.logger.debug('Comments \'%s\'', c.replaceAll('\r', '').replaceAll('\n', ''));
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
