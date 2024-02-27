const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const fs = require('fs');
const os = require('os');

const unsigned = _=>_>>>0;
const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');


class  MessageHandler{
  static MASK   = 0xFF_FF_FF_FF;
  static HEADER = 0xD0_00_00_DE;
  static FOOTER = 0xDE_AD_BE_AF;
  static MESSAGE_BUFFER_SIZE = 24; //24bytes; 8 words IR readings, 1 extra word, footer word

  constructor(){
    this.preamble = 0;
    this.msgBuffer = new UInt16Array[MESSAGE_BUFFER_SIZE];
    this.subscribers = [];
  }

  onData(data) {
    for (var i = 0; i < data.length; i++) {
      this.preamble = unsigned(this.preamble << 8);
      this.preamble = unsigned(this.preamble | data[i]);
      if(this.preamble === FOOTER){
        if(this.isValidMessage()){
          this.notifiyMessage();
        }
        this.resetMessage();
      }

      DEFAULT_LOGGER.log(this.preamble.toString(16));
      this.preamble = 0;
      DEFAULT_LOGGER.debug(this.preamble.toString(16));
    }
  }

  resetMessage() {
    this.msgBuffer = new UInt16Array(MessageHandler.MESSAGE_BUFFER_SIZE);
  }

  isValidMessage() {
    return true;
  }

  notifiyMessage(){
    this.subscribers.forEach(s=>{
      s(UInt16Array.from(hthis.msgBuffer));
    });
  }

  subscribe(subscriber){
    if(Array.isArray(this.subscribers)) {
      this.subscribers.push(subscriber);
    }else{
      this.subscribers.push(subscriber);
    }
    return this;
  }
}

class SerialClient{
  static #BUFFER_CLEAR_DELAY = 5;
  static #INITIALIZE_TIMEOUT = 5000;
  static #RESPONSE_WAIT_TIMEOUT = 60000;

  constructor(portPath, errorHandler = DEFAULT_LOGGER.error) {
    this.port = null;
    this.portPath = portPath;
    this.handlers = {
      onError: []
    };

    let messageHandler = new MessageHandler();
    this.registerHandler('onData', messageHandler.onData.bind(this.messageHandler));
    this.registerHandler('onError', errorHandler);
    this.setup();
  }

  setup() {
    this.port = new SerialPort({ path: this.portPath, baudRate: 9600 }, this.errorHandler.bind(this));
    this.port.on('error', (...args) => this.errorHandler(...args));
    this.port.on('data',  (...args) => this.dataHandler(...args));
  }

  dataHandler(data) {
    this.handlers['onData'].forEach(h=>h.apply(h, arguments));
  }

  errorHandler() {
    this.handlers['onError'].forEach(h=>h.apply(h, arguments));
  }

  registerHandler(event, handler) {
    if(Array.isArray(this.handlers[event])) {
      this.handlers[event].push(handler);
    }else{
      this.handlers[event] = [handler];
    }
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

SerialClient.Message = Message;

module.exports = SerialClient;
