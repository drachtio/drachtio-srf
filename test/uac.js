const test = require('blue-tape');
const config = require('config');
const Srf = require('..');
//const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(srf) {
  return new Promise((resolve, reject) => {
    srf.connect(config.get('drachtio-sut'));
    srf.on('connect', () => { resolve();});
  });
}

test('UAC', (t) => {
  t.timeoutAfter(60000);

  let srf = new Srf();
  connect(srf)
    .then(() => {
      return srf.createUAC('sip:sipp-uas', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        }
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#createUAC returns a Promise that resolves with the uac dialog');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        srf.createUAC('sip:sipp-uas', {
          method: 'INVITE',
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org'
          }
        }, (err, uac) => {
          if (err) return reject(err);
          resolve(uac);
        });
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#createUAC can take a callback that returns the uac dialog');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })

    .then(() => {
      return srf.createUAC('sip:sipp-uas-auth', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        },
        auth: {
          username: 'foo',
          password: 'bar'
        }
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#createUAC can handle digest authentication, sending to same server');
    })
    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return srf.createUAC('sip:172.29.0.15', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        },
        auth: {
          username: 'foo',
          password: 'bar'
        }
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#createUAC can handle digest authentication');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })

    .then(() => {
      return new Promise((resolve, reject) => {
        srf.request('sip:sipp-uas-auth-register', {
          method: 'REGISTER',
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org',
            Contact: '<sip:dhorton@localhost>;expires=3600'
          },
          auth: {
            username: 'foo',
            password: 'bar'
          }
        }, (err, req) => {
          if (err) return reject(err);
          req.on('response', (res) => {
            if (res.status === 200) return resolve();
            reject(new Error(`REGISTER was rejected after auth with ${res.status}`));
          });
        });
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#request can handle digest authentication');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        srf.request('sip:sipp-uas-auth-register', {
          method: 'REGISTER',
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org',
            Contact: '<sip:dhorton@localhost>;expires=3600'
          },
          auth: {
            username: 'foo',
            password: 'bar'
          }
        })
        .then((req) => {
          req.on('response', (res) => {
            if (res.status === 200) return resolve();
            reject(new Error(`REGISTER was rejected after auth with ${res.status}`));
          });
        })
        .catch((err) => {
          t.end(err, 'Srf#request returns a Promise');
        });
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#request returns a Promise');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        srf.request({
          uri: 'sip:sipp-uas-auth-register',
          method: 'REGISTER',
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org',
            Contact: '<sip:dhorton@localhost>;expires=3600'
          },
          auth: {
            username: 'foo',
            password: 'bar'
          }
        })
        .then((req) => {
          req.on('response', (res) => {
            if (res.status === 200) return resolve();
            reject(new Error(`REGISTER was rejected after auth with ${res.status}`));
          });
        })
        .catch((err) => {
          t.end(err, 'srf.request accepts opts.uri');
        });
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('srf.request accepts opts.uri');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        srf.request('sip:sipp-uas-auth-register-no-realm', {
          method: 'REGISTER',
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org',
            Contact: '<sip:dhorton@localhost>;expires=3600'
          },
          auth: {
            username: 'foo',
            password: 'bar'
          }
        }, (err, req) => {
          if (err) return reject(err);
          req.on('response', (res) => {
            if (res.status === 200) return resolve();
            reject(new Error(`REGISTER was rejected after auth with ${res.status}`));
          });
        });
      });
    })
    .then((uac) => {
      srf.disconnect();
      return t.pass('Srf#request can handle digest authentication with empty realm');
    })

    .then(() => {
      return t.end();
    })
    .catch((err) => {
      console.log(`error received: ${err}`);
      if (srf) srf.disconnect();
      t.error(err);
    });
});
