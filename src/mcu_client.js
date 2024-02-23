#!/usr/bin/env node
const SerialClient = require('./serialclient.js');
const logFactory = require('./logFactory.js');
//Using logger for debug info. Console is used of output we want to see on cli
const logger = logFactory.createLogger('mcu_client');
let queue = [],
  isWaiting = false;

const readline = require('readline').createInterface({
  input:  process.stdin,
  output: process.stdout
});

readline.on('line', (text) => {
  queue.push(text);
  logger.debug('readling: %s', text);
});

function proccessMessages(serial) {
  if (queue.length) {
    isWaiting = false;
    logger.debug('Processing:', queue[0]);
    serial
      .send(queue.shift())
      .then((results) => {
        console.log(JSON.stringify(results));
        return results;
      })
      .catch(logger.error)
      .then(() => {
        return proccessMessages(serial);
      });
  } else {
    if (!isWaiting) {
      isWaiting = true;
      logger.log('\tWaiting for input');
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(proccessMessages(serial));
      }, 200);
    });
  }
}

function do_stuff_with_hams(connected_serials) {
  if (!connected_serials.length) {
    logger.error('No HAMs are connected. Exit');
    return;
  }

  console.warn('HAMs are connected');
  connected_serials.forEach((s) => {
    console.warn(s.get_port_info().path, s.get_ham_version());
  });

  proccessMessages(connected_serials[0]);
}

SerialClient.getSerials().then(do_stuff_with_hams);
