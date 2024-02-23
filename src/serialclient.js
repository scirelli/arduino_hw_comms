const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const fs = require('fs');
const os = require('os');

function SerialClient(portPath, error_callback, serialport = SerialPort) {
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

module.exports = SerialClient;
