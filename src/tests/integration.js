#!/usr/bin/env node
require('../Function.js');
const {SerialClient,
  motorBreakMsg,
  motorStopMsg,
  motorCCWMsg,
  motorCWMsg,
	createNeoPixelMsg
} = require('../SerialClient.js');
const delay = (time, ...args) => new Promise(resolve=>setTimeout(resolve, time, ...args));

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
  const client = new SerialClient();
  client.addErrorHandler(console.error);
  client.addMsgHandler(m=>console.log(m.toString()));
  DEFAULT_LOGGER.log('Sending a msg');
  client.send('Hello hardware!!').catch(DEFAULT_LOGGER.error);
}

function test_3() {
  const DEFAULT_LOGGER = logFactory.createLogger('Test3');
  const client = new SerialClient('/dev/ttyACM0', false);
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
  SerialClient.getSerials().then((clients)=>{
    clients.forEach(c=>c.close());
  });
}

function test_5() {
  SerialClient.getSerials().then(async function(clients) {
    if(!clients.length) return;
    const client = clients[0];
    client.addMsgHandler(m=>console.log(m.toString()));
    for(let i=0; i<100; i++) {
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
  SerialClient.getSerials().then(async function(clients) {
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

  SerialClient.getSerials().then(async function(clients) {
    const client = clients[0];
    client.addMsgHandler(msg=> {
      const fullByte = (msg[EXTRA_BITS_IDX] << 8) | msg[EXTRA_BITS_IDX + 1];
      console.log(
        'Full byte: ' + fullByte.toString(16) + '\n\t',
        'Overcurrent set: ' + Boolean(((fullByte >>> MOTOR_OVERCURRENT_BIT) & 1)) + '\n\t',
        'Door switch set: ' + Boolean(((fullByte >>> DOOR_SWITCH_BIT) & 1)) + '\n\t',
        'Motor Limit 1: ' + Boolean(((fullByte >>> MOTOR_LIMIT_ONE_BIT) & 1)) + '\n\t',
        'Motor Limit 2: ' + Boolean(((fullByte >>> MOTOR_LIMIT_TWO_BIT) & 1))
      );
    });
    await delay(5000);
    clients.forEach(c=>c.close());
  });
}

function test_8() {
  SerialClient.getSerials().then(async function(clients) {
    const client = clients[0];
    client.addMsgHandler(_=>{});
		for(let i=0; i<10; i++) {
			await client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0xFF, 0x00, 0x00));
			await client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0x00, 0x00, 0x00));
		}
    await delay(5000);
    clients.forEach(c=>c.close());
  });
}

function test_9() {
	const RUNTIME = 2 * 60 * 1000;
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

  SerialClient.getSerials().then(async function(clients) {
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
		await Promise.allSettled([
			(function() {
					return client.send.delay(client, 200, motorCCWMsg).then(()=>{
						client.send.delay(client, 200, motorCWMsg);
					})
			}).loopChain(20).then(()=>{
				return client.send.delay(client, 100, motorStopMsg);
			}),

			(function() {
					return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0xFF, 0x00, 0x00))
						.then(()=>{
							return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0x00, 0x00, 0x00));
						})
						.then(()=>{
							return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0xFF, 0xFF, 0xFF));
						})
						.then(()=>{
							return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0x00, 0x00, 0x00));
						})
						.then(()=>{
							return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0x00, 0x00, 0xFF));
						})
						.then(()=>{
							return client.send.delay(client, 1000, createNeoPixelMsg(0, 8, 0x00, 0x00, 0x00));
						});
			}).loopChain(20)
		]);

    await client.send.delay(client, 100, motorBreakMsg);
    await delay(1000);
    await client.send.delay(client, 100, motorStopMsg);
    await delay(RUNTIME);
    clients.forEach(c=>c.close());
  });
  function reconst(msg, idx) {
    return (msg[idx] << 8) | msg[idx + 1];
  }
}

async function loopChain(fnc, iterations, i=0) {
	while(i++<iterations) {
		await fnc();
	}
}

if(process.argv[0] === __filename || process.argv[1] === __filename) {
  test_9();
}
