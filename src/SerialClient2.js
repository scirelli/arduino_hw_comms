const fs = require('fs');
const os = require('os');
const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const {crc16_rev_update} = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter')
const {Transform} = require("stream");

const unsigned = _=>_>>>0;
const DEFAULT_LOGGER = logFactory.createLogger('SerialClient');


const lowercase = new Transform({
	transform(chunk, encoding, callback){
		callback(null, chunk.toString().toLowerCase());
	}
});

const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 9600 });
//const parser = port.pipe(new DelimiterParser({ delimiter: Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]), includeDelimiter: true }));
const parser = port.pipe(lowercase);
parser.on('data', (msg)=>{
	console.log(msg.toString());
});

