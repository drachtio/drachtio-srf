const test = require('tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const Proxy = require('./scripts/proxy');
const debug = require('debug')('drachtio:srf');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('proxy', (t) => {
  t.timeoutAfter(60000);

  let proxy = new Proxy();

  Promise.resolve()

    // proxy uses Promise
    .then(() => {
      return proxy.proxyPromise(['sip:123124123@sipp-uas;transport=udp']);
    })
    .then((proxy) => {
      return sippUac('uac-proxy.xml');
    })
    .then(() => {
      t.pass('srf.proxyRequest returns a Promise');
      return proxy.disconnect();
    })

    .then(() => {
      proxy.disconnect();
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
      if (proxy) proxy.disconnect();
      console.log(`error received: ${err}`);
      console.log(output());
      t.error(err);
    });
});
