const test = require('tape');
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
      p = uas.handleReinviteScenario();
      return;
    })
    .then(() => sippUac('uac-send-reinvite-no-sdp.xml'))
    .then(() => uas.disconnect())
    .then(() => t.pass('res#send of 200 OK supports fnAck'))
    .then(() => t.end())
    .catch((err) => {
      if (uas) uas.disconnect();
      console.log(`error received: ${err}`);
      console.log(output());
      t.error(err);
    });
  });
