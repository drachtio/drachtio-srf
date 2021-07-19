const test = require('tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(connectable) {
  return new Promise((resolve, reject) => {
    connectable.on('connect', (err) => {
      if (err) reject(err);
      return resolve();
    });
  });
}

test('REFER tests', (t) => {
  t.timeoutAfter(20000);

  const b2b = require('./scripts/refer-b2b.js');
  const uas = require('./scripts/refer-uas');
  let p1, p2;

  Promise.all([connect(b2b), connect(uas)])
    .then(() => {
      p1 = sippUac('uac-recv-reinvite.xml');
      return;
    })
    .then(() => {
      p2 = sippUac('uac-recv-reinvite.xml');
      return;
    })
    .then(() => Promise.all([p1, p2]))
    .then(() => t.pass('attended transfer success'))

    .then(() => b2b.disconnect())
    .then(() => uas.disconnect())
    .then(() => t.end())
    .catch((err) => {
      t.error(err);
      b2b.disconnect();
      uas.disconnect();
    });
  });
