const test = require('tape');
const config = require('config');
const Srf = require('..');
//const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(srf) {
  return new Promise((resolve, reject) => {
    srf.connect(config.get('drachtio-sut'));
    srf.on('connect', () => { resolve(); });
  });
}

test('UAC', (t) => {
  t.timeoutAfter(80000);

  let uacOverlap;
  let srf = new Srf();
  connect(srf)
    .then(() => {
      return srf.createUAC('sip:sipp-uas-prack', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        }
      });
    })
    .then((uac) => {
      t.pass('Srf#createUAC sends PRACK when received RSeq');
      uac.destroy();
      return;
    })
    .then(() => {
      return srf.createUAC('sip:sipp-uas-302', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        },
        followRedirects: true,
        keepUriOnRedirect: true
      });
    })
    .then((uac) => {
      t.pass('Srf#createUAC follows 3XX redirect when asked');
      uac.destroy();
      return;
    })

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
      return srf.createUAC('sip:sipp-uas', {
        method: 'INVITE',
        callingNumber: '12345',
        headers: {
          'Subject': 'sending Contact based on callingNumber'
        }
      });
    })
    .then((uac) => uac.destroy())
    .then(() => {
      srf.disconnect();
      return t.pass('Srf#createUAC accepts opts.callingNumber');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return srf.createUAC('sip:sipp-uas', {
        method: 'INVITE',
        callingNumber: '12345',
        headers: {
          'Subject': 'sending explicit Contact',
          'Contact': 'sip:foo@localhost'
        }
      });
    })
    .then((uac) => uac.destroy())
    .then(() => {
      srf.disconnect();
      return t.pass('Srf#createUAC accepts opts.callingNumber');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return srf.createUAC('sip:sipp-uas', {
        method: 'INVITE',
        callingNumber: '12345',
        headers: {
          'Subject': 'sending explicit contact',
          'contact': 'sip:foo@localhost'
        }
      });
    })
    .then((uac) => uac.destroy())
    .then(() => {
      srf.disconnect();
      return t.pass('Srf#createUAC accepts opts.callingNumber');
    })

    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return srf.createUAC('sip:sipp-uas-reinvite-overlap', {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org'
        }
      });
    })
    .then((uac) => {
      uacOverlap = uac;
      const p1 = uac.modify(uac.local.sdp);
      const p2 = uac.modify(uac.local.sdp);
      const p3 = uac.modify(uac.local.sdp);
      return Promise.all([p1, p2, p3]);
    })
    .then(() => uacOverlap.destroy())
    .then(() => {
      srf.disconnect();
      return t.pass('SipDialog will not send overlapping re-invites');
    })
    .then(() => {
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return srf.createUAC('sip:172.29.0.25', {
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
      uacOverlap = uac;
      return uac.modify('hold');
    })
    .then(() => uacOverlap.destroy())
    .then(() => {
      srf.disconnect();
      return t.pass('SipDialog will handle authentication on re-invites');
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
      return srf.createUAC('sip:sipp-uas-407-no-auth-header', {
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
    .then((uac, err) => {
      srf.disconnect();
      return t.fail('Srf#createUAC should not handle digest without authentication');
    })
    .catch((err) => {
      srf.disconnect();
      return t.pass('Srf#createUAC cannot handle digest without authentication');
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
      return srf.createUAC('sip:172.29.0.24', {
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
      return uac.destroy().then(() => {
        srf.disconnect();
        return t.pass('Srf#createUAC can handle bye with digest authentication');
      });
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
      srf = new Srf();
      return connect(srf);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        let inviteSent;
        srf.createUAC('sip:sipp-uas-cancel', {
          headers: {
            To: 'sip:dhorton@sip.drachtio.org',
            From: 'sip:dhorton@sip.drachtio.org'
          }
        }, {
          cbRequest: (err, req) => inviteSent = req,
          cbProvisional: (response) => {
            if (response.status < 200) {
              inviteSent.cancel({ headers: { 'Reason': 'SIP;cause=200;text="Call completed elsewhere"' } });
            }
          }
        }, (err, dlg) => {
          if (err && err.status === 487) resolve();
          else (reject(`expected 487 response to status, got ${err}`));
        });
      });
    })
    .then(() => {
      srf.disconnect();
      return t.pass('Srf#request can be canceled');
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
