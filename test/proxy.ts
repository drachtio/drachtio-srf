// @ts-nocheck
import test from 'tape';
import sipp from './sipp';
const { output, sippUac } = sipp('test_testbed');
import Proxy from './scripts/proxy';
import debugFn from 'debug';
const debug = debugFn('drachtio:srf');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('proxy', (t) => {
  t.timeoutAfter(60000);

  let proxy = new Proxy();

  Promise.resolve()

    // proxy uses Promise
    .then(() => {
      return proxy.proxyPromise('sipp-uas');
    })
    .then((proxy) => {
      return sippUac('uac-proxy.xml');
    })
    .then(() => {
      t.pass('srf.proxyRequest returns a Promise');
      return proxy.disconnect();
    })

    //proxy provides callback
    .then(() => {
      proxy = new Proxy();
      return proxy.proxyCb('sipp-uas');
    })
    .then((uas) => {
      return sippUac('uac-proxy.xml');
    })
    .then(() => {
      return t.pass('srf.proxyRequest accepts a callback');
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
