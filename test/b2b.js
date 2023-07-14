const test = require('tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const B2b = require('./scripts/b2b');
const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('B2B', (t) => {
  t.timeoutAfter(180000);

  let b2b = new B2b();
  b2b.on('connected', ({uas, uac}) => {
    uas.on('destroy', () => {
      //console.log('got BYE from A sending to B');
      uac.destroy();
    });
  });

  Promise.resolve()
    // INVITE with no SDP
    
    // CANCEL from A
    .then(() => {
      debug('starting sipp');
      return b2b.expectCancel('sip:sipp-uas-cancel');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-cancel.xml');
    })
    .then(() => {
      return t.pass('b2b CANCELs B leg when CANCEL is received from A');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 100);
      });
    })
    .then(() => {
      return t.end();
    })
    .catch((err) => {
      console.log(`error received: ${err}`);
      console.log(output());
      if (b2b) b2b.disconnect();
      t.error(err);
    });
  });
