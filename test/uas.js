const test = require('blue-tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const Uas = require('./scripts/uas');
const debug = require('debug')('drachtio:srf');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('UAS', (t) => {
  t.timeoutAfter(60000);

  let uas = new Uas();

  Promise.resolve()

    // return 503
    .then(() => {
      return uas.reject(503);
    })
    .then((uas) => {
      return sippUac('uac-expect-503.xml');
    })
    .then(() => {
      t.pass('uas reject INVITE with 503');
      return uas.disconnect();
    }).

    //Srf#createUAS returns a Promise
    then(() => {
      uas = new Uas();
      return uas.accept();
    })
    .then((uas) => {
      return sippUac('uac.xml');
    })
    .then(() => {
      uas.disconnect();
      return t.pass('Srf#createUAS returns a promise');
    })

    //Srf#createUAS can accept a callback
    .then(() => {
      uas = new Uas();
      return uas.acceptCb();
    })
    .then((uas) => {
      return sippUac('uac.xml');
    })
    .then(() => {
      uas.disconnect();
      return t.pass('Srf#createUAS accepts a callback');
    })

    //Srf#createUAS returns a Promise
    .then(() => {
      uas = new Uas();
      return uas.accept(null, true);
    })
    .then((uas) => {
      return sippUac('uac.xml');
    })
    .then(() => {
      uas.disconnect();
      return t.pass('Srf#createUAS opts.body is an alias for opts.localSdp');
    })

    //Srf#createUAS creates a dialog on 200 OK, not ACK
    .then(() => {
      uas = new Uas();
      return uas.accept();
    })
    .then((uas) => {
      uas
        .on('connected', (uas) => {
          t.pass('uas dialog created when 200 OK sent');
          uas.on('destroy', (msg, reason) => {
            if (reason === 'ACK timeout') {
              t.pass('uas dialog destroyed with ACK timeout after 32s');
            }
          });
        })
        .on('error', (err) => {
          t.error(err);
        });
      return sippUac('uac-drop-all-200.xml');
    })
    .then(() => {
      uas.disconnect();
      return;
    })

    .then(() => {
      uas = new Uas();
      return uas.acceptSubscribe();
    })
    .then((uas) => {
      uas.on('connected', (dlg) => {
        t.ok(1 === dlg.getCountOfSubscriptions(), 'creates a dialog on successful SUBSCRIBE');

        // send immediate NOTIFY, then another to terminate the subscription
        Promise.resolve()
          .then(() => {
            return dlg.request({
              method: 'NOTIFY',
              headers: {
                'Event': 'presence',
                'Subscription-State': 'active'
              }
            });
          })
          .then(() => {
            return dlg.request({
              method: 'NOTIFY',
              headers: {
                'Event': 'presence',
                'Subscription-State': 'terminated'
              }
            });
          })
          .then(() => {
            return t.ok(0 === dlg.getCountOfSubscriptions(), 'dialog destroyed on terminated subscription');
          })
          .catch((err) => {
            t.end(err);
          });

      });
      return sippUac('uac-subscribe.xml');
    })

    .then(() => {
      uas.disconnect();
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
      if (uas) uas.disconnect();
      console.log(`error received: ${err}`);
      console.log(output());
      t.error(err);
    });
});
