const test = require('blue-tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const Uas = require('./scripts/uas');
const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('UAS - Subscribe', (t) => {
  t.timeoutAfter(20000);

  const uas = new Uas();
  uas.on('connected', (uas) => {
    uas.destroy();
  });

  Promise.resolve()

    // return 503
    .then(() => {
      debug('starting sipp');
      return uas.acceptSubscribe();
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-subscribe.xml');
    })
    .then(() => {
      t.pass('pass');
      return;
    })
    .then(() => {
      uas.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 1000);
      });
    })
    .then(() => {
      return t.end();
    })
    .catch((err) => {
      if (uas) uas.disconnect();
      console.log(`error received: ${err}`);
      console.log(output());
      t.error(err);
    });
});
