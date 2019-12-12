const test = require('blue-tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const Uas = require('./scripts/uas');
const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('reinvite tests', (t) => {
  t.timeoutAfter(20000);

  let uas = new Uas();
  let p;

  Promise.resolve()
    .then(() => {
      uas = new Uas();
      p = uas.handleReinviteScenario();
      return;
    })
    .then((uas) => {
      return sippUac('uac-send-reinvite-no-sdp.xml');
    })
    .then(() => {
      return p;
    })
    .then(() => {
      uas.disconnect();
      return t.pass('res#send of 200 OK supports fnAck');
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
