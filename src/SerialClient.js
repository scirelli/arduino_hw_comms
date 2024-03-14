const fs = require('fs');
const os = require('os');
const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const {crc16_rev_update} = require('./crc16.js');

const unsigned = _=>_>>>0;
const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');

class IDataHandler {
  onData(){
    throw new Error('Not Implemented');
  }
}

class  MessageBuilder extends IDataHandler{
  static MASK   = 0xFF_FF_FF_FF;
  //static HEADER = 0xD0_00_00_DE;
  static HEADER = 0x00_D0_DE_00;
  //static FOOTER = 0xDE_AD_BE_AF;
  static FOOTER = 0xAD_DE_AF_BE;
  static MESSAGE_BUFFER_SIZE = 24; //24bytes; 8 16bit words (16 bytes) IR readings, 1 16bit word (2 bytes) extra data, 1 16bit word (2 bytes) CRC, 2 16bit word (4 bytes) footer
  static MSG_CRC_LOW_BYTE = 18;
  static MSG_CRC_HIGH_BYTE = 19;
  static CONTENT_SZ = 18; // bytes

  constructor() {
    super();
    this.preamble = 0;
    this.msgBuffer = new Uint8Array(MessageBuilder.MESSAGE_BUFFER_SIZE);
    this.msgBufferIdx = 0;
    this.subscribers = [];
  }

  onData(data) {
    for (var i = 0; i < data.length; i++) {
      this.msgBuffer[this.msgBufferIdx++ % MessageBuilder.MESSAGE_BUFFER_SIZE] = data[i];
      this.preamble = unsigned(this.preamble << 8);
      this.preamble = unsigned(this.preamble | data[i]);
      if(this.preamble === MessageBuilder.FOOTER) {
        if(this.isValidMessage()) {
          DEFAULT_LOGGER.debug('Raw message: ', this.msgBuffer);
          this.notifiyMessage();
        }else{
          DEFAULT_LOGGER.error('Invalid message. Raw message: ', this.msgBuffer);
        }
        this.resetMessage();
        continue;
      }
    }
  }

  resetMessage() {
    this.preamble = 0;
    this.msgBufferIdx = 0;
    this.msgBuffer = new Uint8Array(MessageBuilder.MESSAGE_BUFFER_SIZE);
    return this;
  }

  isValidMessage() {
    let crc = 0,
      msgCRC = ((this.msgBuffer[MessageBuilder.MSG_CRC_HIGH_BYTE]<<8) | this.msgBuffer[MessageBuilder.MSG_CRC_LOW_BYTE]);

    for(let i=0; i < MessageBuilder.CONTENT_SZ; i++){
      crc = crc16_rev_update(crc, this.msgBuffer[i]);
    }

    return crc === msgCRC;
  }

  notifiyMessage() {
    let msg = this.toBigEndianWord(this.msgBuffer);
    this.subscribers.forEach(s=>{
      s(msg.slice(0));
    });

    return this;
  }

  subscribe(subscriber) {
    if(Array.isArray(this.subscribers)) {
      this.subscribers.push(subscriber);
    }else{
      this.subscribers.push(subscriber);
    }
    return this;
  }

  toBigEndianWord(msg) {
    let m = new Uint16Array(msg.length/2);
    for(let i=0, mi=0; i<msg.length; i+=2) {
      m[mi++] = (msg[i+1] << 8) | msg[i];
    }
    return m;
  }

  to16bitWord(msg) {
    let m = new Uint16Array(msg.length/2);
    for(let i=0, mi=0; i<msg.length; i+=2) {
      m[mi++] = (msg[i] << 8) | msg[i+1];
    }
    return m;
  }

  swapEndian(msg) {
    let converted = new Uint8Array(msg.length);
    for(let i=0; i<msg.length; i+=2) {
      converted[i+1] = msg[i];
      converted[i] = msg[i+1];
    }
    return converted;
  }
}

class IErrorHandler{
  onError() {
    throw new Error('Not Implemented');
  }
}

class ErrorHandler extends IErrorHandler{
  onError() {
    DEFAULT_LOGGER.error.apply(arguments);
  }
}

class SerialClient{
  static #BUFFER_CLEAR_DELAY = 5;
  static #INITIALIZE_TIMEOUT = 5000;
  static #RESPONSE_WAIT_TIMEOUT = 60000;

  constructor(portPath, errorHandler = new ErrorHandler(), messageBuilder = new MessageBuilder().subscribe(DEFAULT_LOGGER.log)) {
    this.port = null;
    this.portPath = portPath;
    this.messageBuilders = [];
    this.errorHandlers = [];

    this.addMessageBuilder(messageBuilder);
    this.addErrorHandler(errorHandler);
    this.setup();
  }

  setup() {
    this.port = new SerialPort({ path: this.portPath, baudRate: 9600 }, this._errorHandler.bind(this));
    this.port.on('error', (...args) => this._errorHandler(...args));
    this.port.on('data',  (...args) => this._dataHandler(...args));
  }

  addMessageBuilder(messageBuilder) {
    this.messageBuilders.push(messageBuilder);
    return this;
  }

  addErrorHandler(errorHandler) {
    this.errorHandlers.push(errorHandler);
    return this;
  }

  send(msg /*Uint8Array*/, responseTimeout = response_wait_timeout) {
    if (!(msg instanceof Uint8Array) || msg === null || (msg instanceof Uint8Array && msg.length === 0)) return Promise.reject('Invalid Uint8Array or array is empty');
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        this.resolvers.pop();
        reject('Did not receive a response.');
      }, responseTimeout);

      let rezolvers = [resolve, reject, timeout];
      this.resolvers.push(rezolvers);
      port.write(msg, (err) => {
        if (err) {
          reject(err);
          clearTimeout(timeout);
          resolvers.pop();
        }
      });
    });
  }

  _dataHandler() {
    this.messageBuilders.forEach(mb=>{
      mb.onData.apply(mb, arguments);
    });
    return this;
  }

  _errorHandler() {
    this.errorHandlers.forEach(eh=>{
      eh.onError.apply(eh, arguments);
    });
    return this;
  }
}

function _SerialClient(portPath, error_callback, serialport = SerialPort) {
  function receive_data(raw_data) {
    var data = raw_data.toString();
    for (var i = 0; i < data.length; i++) {
      accumulate_byte(data[i]);
    }
  }

  function errorhandler(err) {
    if (!err) return;
    if (error_callback) error_callback(err);
  }

  function send(msg, responseTimeout = response_wait_timeout) {
    if (typeof msg === 'string') msg = parse_json(msg);
    if (typeof msg !== 'object' || msg === null) return Promise.reject('Message needs to be object!');
    msg = JSON.stringify(msg);
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        resolvers.pop();
        reject('Did not receive a response.');
      }, responseTimeout);
      let rezolvers = [resolve, reject, timeout];
      resolvers.push(rezolvers);
      port.write(msg, (err) => {
        if (err) {
          reject(err);
          clearTimeout(timeout);
          resolvers.pop();
        }
      });
    });
  }

  function resultResolver(data) {
    if (!resolvers.length) {
      return errorhandler(new Error('No available resolvers.'));
    }
    let [resolve, reject, timeout] = resolvers.shift();
    clearTimeout(timeout);
    if (typeof data !== 'object' || Array.isArray(data)) {
      if (reject) reject('Invalid response');
    } else {
      if (resolve) resolve(data);
    }
  }

  function accumulate_byte(char) {
    time_to_clear = buffer_clear_delay;
    data_buffer += char;
    var data = parse_json(data_buffer);
    if (data === null) return;
    data_buffer = '';
    if (!connected_to_ham) {
      confirm_connection(data);
    }
    resultResolver(data);
  }

  function confirm_connection(data) {
    if (data.version) {
      connected_to_ham = data.version;
      promise_of_connection(serial_connection);
    }
  }

  function parse_json(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function clean_buffer() {
    setTimeout(() => clean_buffer.apply(this, []), 100);
    if (data_buffer === '') return;
    if (time_to_clear > 0) return time_to_clear--;
    errorhandler({ message: 'discard partial data', contents: data_buffer });
    data_buffer = '';
  }

  function disconnect(msg) {
    if (port.isOpen) port.close();
    promise_of_disconnection(msg);
  }

  function perform_handshake() {
    connected_to_ham = null;
    send('{"get":"intro"}').catch(errorhandler);
    setTimeout(() => {
      if (!connected_to_ham) disconnect.apply(this, ['no response']);
    }, initialize_timeout);
    return new Promise((resolve, reject) => {
      promise_of_connection = resolve;
      promise_of_disconnection = reject;
    });
  }

  const buffer_clear_delay = 5;
  const initialize_timeout = 5000;
  const response_wait_timeout = 60000;
  var promise_of_connection = null;
  var promise_of_disconnection = null;
  var connected_to_ham = null;
  var time_to_clear = 0;
  var data_buffer = '';
  var resolvers = [];
  var serial_connection = this;
  var port = new serialport({ path: portPath, baudRate: 9600 }, errorhandler);
  port.on('error', errorhandler);
  port.on('data', (x) => {
    receive_data(x);
  });
  clean_buffer();
  this.send = send;
  this.perform_handshake = perform_handshake;
  this.get_ham_version = () => {
    return connected_to_ham;
  };
  this.get_port_info = () => {
    return port;
  };
}

/*
  returns the path to the simulated ham, or null if there isn't one
*/
SerialClient.getCarPort = async function getCarPort() {
  return new Promise((resolve) => {
    fs.realpath(os.homedir() + '/carport', (err, path) => resolve(path));
  });
};

SerialClient.getDevices = async function getDevices() {
  var ports = await SerialPort.list();
  var simport = await SerialClient.getCarPort();
  let paths = ports.map((f) => f.path);
  if (simport) paths.push(simport);
  return paths;
};

SerialClient.getSerials = async function getSerials() {
  return SerialClient.getDevices().then((ports) => {
    console.warn(ports);
    return Promise.allSettled(
      ports.map((port) => {
        const logger = logFactory.createLogger(`SerialClient:${port}`);
        return new SerialClient(port, logger.error).perform_handshake();
      })
    ).then((promises) => {
      return promises.filter((promise) => promise.status === 'fulfilled').map((prommy) => prommy.value);
    });
  });
};

SerialClient.MessageBuilder = MessageBuilder;

module.exports = SerialClient;
