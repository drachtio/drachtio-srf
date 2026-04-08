// @ts-nocheck
import test from 'tape';
import sippFn from './sipp';
const { output, sippUac } = sippFn('test_testbed');
import debugFn from 'debug';
const debug = debugFn('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(connectable: any) {
  return new Promise<void>((resolve, reject) => {
    connectable.on('connect', (err: any) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

test('REFER tests', async (t) => {
  t.timeoutAfter(20000);

  const b2b = (await import('./scripts/refer-b2b')).default;
  const uas = (await import('./scripts/refer-uas')).default;
  let p1: any, p2: any;

  await Promise.all([connect(b2b), connect(uas)])
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
