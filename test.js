#!/usr/bin/env node
const SerialClient = require('./src/SerialClient.js');
sc = new SerialClient('/dev/ttyACM1');
