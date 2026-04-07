// @ts-nocheck
import test from 'tape';
import { output, sippUac  } from './sipp';('test_testbed');
import debug from 'debug';('drachtio:test');

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

  import b2b from './scripts/refer-b2b.js';
  import uas from './scripts/refer-uas';
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
