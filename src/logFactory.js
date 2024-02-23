const debug = require('debug');
const LOGGERS = [
  'assert',
  'debug',
  'error',
  'exception',
  'info',
  'log',
  'trace',
  'warn'
];

function enable(loggers = LOGGERS) {
  if (!loggers || !loggers.length) return;
  if (!Array.isArray(loggers)) {
    loggers = [loggers];
  }

  loggers.forEach((l) => {
    if (this[l]) this[l].enabled = true;
  });
}

function createLogger(name) {
  return LOGGERS.reduce(
    (a, m) => {
      a[m] = debug(`${m.toUpperCase()}:${name}`);
      return a;
    },
    { enable: enable }
  );
}

module.exports = {
  create:       createLogger,
  createLogger: createLogger,
  enable:       enable,
  LOGGERS:      LOGGERS
};
