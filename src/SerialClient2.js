const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { SerialPort } = require('serialport');
const logFactory = require('./logFactory.js');
const { crc16_rev_update } = require('./crc16.js');
const { DelimiterParser, TransformOptions} = require('@serialport/parser-delimiter');
const { Transform } = require('stream');

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

/*
Comments are in the form 
# Some text \n
This function only works on char arrays.
 */
function stripComments(msg) {
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
			DEFAULT_LOGGER.debug('Removed comment \'%s\'', comment);
			return REMOVE; //Remove the  newline
		}
		if(state === REMOVE){
			comment += String.fromCharCode(c);
		}
		return state;
	});
}

const swapEndianTransform = new Transform({
		transform(chunk, encoding, callback) {
			callback(null, swapEndian(chunk));
		}
	}),
	removeComments = new Transform({
		transform(chunk, encoding, callback) {
			callback(null, stripComments(chunk));
		}
	})
	delimiterParser = new DelimiterParser({
		delimiter: Uint8Array.from([0xAD, 0xDE, 0xAF, 0xBE]),
		includeDelimiter: true 
	});

function openErrorHandler(err) {
	if(err) return DEFAULT_LOGGER.error('Error: ', err.message)
}

const port = new SerialPort({
	  path: '/dev/ttyACM0', baudRate: 9600,
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
var wrtRtn = port.write('Hi Mom!');
DEFAULT_LOGGER.debug('write result %s', wrtRtn);
wrtRtn = port.write(Buffer.from('Hi Mom!'))
DEFAULT_LOGGER.debug('write result %s', wrtRtn);


function sendInterval() {
		wrtRtn = port.write(Buffer.from('setTimeout'))
		DEFAULT_LOGGER.debug('write result %s', wrtRtn);
		port.drain((err)=>{
			if(err) DEFAULT_LOGGER.error(err);
		  DEFAULT_LOGGER.debug('drained');
			setTimeout(sendInterval, 1000);
		});
}

module.exports.SerialClient = class SerialClient{
	static #DEFAULT_BAUD_RATE = 9600;
  static #BUFFER_CLEAR_DELAY = 5;
  static #INITIALIZE_TIMEOUT = 5000;
  static #RESPONSE_WAIT_TIMEOUT = 60000;
	static #DEFAULT_PATH = '/dev/ttyACM0';

  constructor(portPath, autoOpen=true) {
    this.port = null;
		this.parser = null;
		this.autoOpen = autoOpen;
    this.portPath = portPath || SerialClient.DEFAULT_PATH;
    this.messageBuilders = [];
    this.errorHandlers = [];

    this.setup();
  }

  setup() {
		this.port = new SerialPort({
				path: this.portPath,
			  baudRate: SerialClient.DEFAULT_BAUD_RATE,
				autoOpen: this.autoOpen
			},
			this._portOpenHandler.bind(this)
		);
    this.port.on('error', (...args) => this._errorHandler(...args));

		this.parser = this.port
										  .pipe(delimiterParser)
										  .pipe(removeComments)
									    .pipe(swapEndianTransform);
    this.parser.on('data', this._dataHandler.bind(this));
  }

	_portOpenHandler(err) {
		if(err) this._errorHandler(err);
	}

	_dataHandler() {
	}

	open() {
		let popen = promisify(this.port.open.bind(this.port));
		return popen().catch( (err) => {
			this._portOpenHandler(err);
			throw err;
		});
	}

	send(msg) {
		return new Promise((resolve, reject)=> {
			//port.write - Returns false if the stream wishes for the calling code to wait for the drain event to be emitted before continuing to write additional data; otherwise true.
			this.port.write(Buffer.from(msg))
			this.port.drain((err)=> {
				if(err) reject(err);
				else resolve(msg);
			});
		});
	}
}
