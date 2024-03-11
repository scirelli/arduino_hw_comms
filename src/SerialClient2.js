const fs = require('fs');
const os = require('os');
const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const {crc16_rev_update} = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter');
const {Transform} = require('stream');

const unsigned = _=>_>>>0;
const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');


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

const swapEndianTransform = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, swapEndian(chunk));
  }
});

const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 9600 });
//const parser = port.pipe(new DelimiterParser({ delimiter: Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]), includeDelimiter: true }));
const parser = port.pipe(new DelimiterParser({ delimiter: Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]), includeDelimiter: true })).pipe(swapEndianTransform);
parser.on('data', (msg)=>{
  console.log(msg.toString());
});

