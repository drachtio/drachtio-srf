const test = require('tape');
const { output, sippUac, sippUas } = require('./sipp')('test_testbed');
const { matchesUacDestroyCrash } = require('./scripts/crash-signatures');
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
    // B2BUA with PRACK
    .then(() => {
      debug('starting sipp');
      return b2b.expectSuccess('sip:sipp-uas-prack', {
        proxyResponseHeaders: [
          'all'
        ],
        responseHeaders: {
          'Contact': 'sip:foo@localhost'
        }
      });
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-prack.xml');
    })
    .then(() => {
      return t.pass('b2b handles PRACK for both UAS and UAC');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })
    // INVITE with no SDP
    .then(() => {
      debug('starting sipp');
      return b2b.expectSuccess('sip:sipp-uas', {
        responseHeaders: {
          'Contact': 'sip:foo@localhost'
        }
      });
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-nosdp.xml');
    })
    .then(() => {
      return t.pass('b2b handles INVITE with late sdp');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // 200 OK from B
    .then(() => {
      debug('starting sipp');
      return b2b.expectSuccess('sip:sipp-uas', {
        responseHeaders: {
          'Contact': 'sip:foo@localhost'
        }
      });
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('b2b handles 200 OK from B');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // specify tag on 200 OK
    .then(() => {
      debug('starting sipp');
      
      return b2b.expectSuccess('sip:sipp-uas', {
        responseHeaders: (uacResponse) => {
          return {'To': `tag=${uacResponse.get('Call-ID')}`}
        }
      });
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('b2b sets tag on 200 OK');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })
    
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
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // handle failure
    .then(() => {
      debug('starting sipp');
      return b2b.expectFailure('sip:sipp-uas-404', 404);
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-expect-404.xml');
    })
    .then(() => {
      return t.pass('b2b passes failure');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // dont pass failure
    .then(() => {
      debug('starting sipp');
      return b2b.expectFailure('sip:sipp-uas-404', 404, 480);
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-expect-480.xml');
    })
    .then(() => {
      return t.pass('dont pass failure to A if opts.passFailure === false');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // pass headers
    .then(() => {
      debug('starting sipp');
      return b2b.passHeaders('sip:sipp-uas');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('pass headers from A to B and vice-versa');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // reject no contact headers in sip request
    .then(() => {
      debug('starting sipp');
      return b2b.expectFailure('sip:sipp-uas-404', 404, 400);
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-expect-400-no-contact-header.xml');
    })
    .then(() => {
      return t.pass('reject if no contact headers in request');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // reject no contact headers in sip response
    .then(() => {
      debug('starting sipp');
      return b2b.expectFailure('sipp-uas-200-ok-no-contact-cancel', 500, 480);
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-expect-480.xml');
    })
    .then(() => {
      return t.pass('reject if no contact headers in response');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // pass headers on response
    .then(() => {
      debug('starting sipp');
      return b2b.passHeadersOnResponse('sip:sipp-uas', {'X-Color': 'green'});
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-success-green.xml');
    })
    .then(() => {
      return t.pass('can supply headers for response to A');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // pass headers on response as function
    .then(() => {
      debug('starting sipp');
      return b2b.passHeadersOnResponse('sip:sipp-uas', (uacRes, headers) => {
        return {'X-Color': 'green'};
      });
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-success-green.xml');
    })
    .then(() => {
      return t.pass('can supply response headers as a function returning an object');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // pass display name in From header
    .then(() => {
      debug('starting sipp');
      return b2b.passHeaders('sip:sipp-uas');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-displayname-from.xml');
    })
    .then(() => {
      return t.pass('pass displayname in From header from A to B');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })
    
    .then(() => {
      debug('starting sipp');
      return b2b.sdpAsPromise('sip:sipp-uas');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('provide opts.localSdpA as a function returning a Promise');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })
    
    .then(() => {
      debug('starting sipp');
      return b2b.sdpAsFunctionReturningString('sip:sipp-uas');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('provide opts.localSdpA as a function returning a string');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })
  
    // uri can be provided in opts
    .then(() => {
      debug('starting sipp');
      return b2b.uriInOpts('sip:sipp-uas');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac.xml');
    })
    .then(() => {
      return t.pass('Srf#createB2BUA(req, res, {uri}) is valid signature');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // 3PCC no-offer INVITE where UAS leg fails after B leg succeeds.
    // Regression test for `uac.destroy is not a function` crash: the
    // cleanup path must reject cleanly instead of throwing a TypeError
    // that escapes as an unhandledRejection and crashes the worker.
    //
    // It ALSO pins the B-leg teardown: the sipp-uas scenario (uas.xml)
    // sends 200 OK then requires ACK + BYE before it completes with exit 0.
    // If createB2BUA failed to tear down the answered B leg (the residual
    // leak), sipp-uas would never see the ACK/BYE and time out -> the
    // sippUasB probe below rejects and this test fails.
    .then(() => {
      debug('starting sipp');
      let sawCrashSignature = false;
      // the bug surfaces as a process-level unhandledRejection (the promise
      // wrapper around __x does not catch async throws); a correct fix
      // surfaces it, if at all, as an app-side error event.
      const onError = (err) => { if (matchesUacDestroyCrash(err)) sawCrashSignature = true; };
      const onRejection = (reason) => { if (matchesUacDestroyCrash(reason)) sawCrashSignature = true; };
      b2b.on('error', onError);
      process.on('unhandledRejection', onRejection);
      b2b.expect3pccUasFailure('sip:sipp-uas-b-teardown');
      // start the B-leg UAS probe: it answers 200 OK and REQUIRES the
      // subsequent ACK + BYE (from createB2BUA's 3pcc teardown) to succeed.
      const sippUasB = sippUas('uas.xml', 'sipp-uas-b-teardown');
      // give the UAS container a moment to start listening before the A-leg
      // INVITE triggers the B-leg INVITE towards it.
      return new Promise((resolve) => setTimeout(resolve, 1500))
        .then(() => sippUac('uac-3pcc-nosdp.xml'))
        .catch(() => {})  // A-leg gets a 480; its own exit code is not the assertion
        .then(() => new Promise((resolve) => setTimeout(resolve, 250)))  // let any late rejection surface
        .then(() => {
          b2b.removeListener('error', onError);
          process.removeListener('unhandledRejection', onRejection);
          if (sawCrashSignature) {
            throw new Error('createB2BUA leaked `uac.destroy is not a function` on 3pcc UAS failure');
          }
          // the B-leg UAS must have received ACK + BYE (proving teardown).
          return sippUasB;
        });
    })
    .then(() => {
      return t.pass('b2b 3pcc UAS failure does not crash and tears down the B leg');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          b2b = new B2b();
          resolve();
        }, 100);
      });
    })

    // very fast reinvite from B, before ACK from A
    .then(() => {
      debug('starting sipp');
      return b2b.immediateReinviteFromB('sip:sipp-uas-fast-reinvite');
    })
    .then(() => {
      debug('start sipp...');
      return sippUac('uac-delayed-ack.xml');
    })
    .then(() => {
      return t.pass('Srf#createB2BUA queues fast requests from B until receiving ACK from A');
    })
    .then(() => {
      b2b.disconnect();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 800);
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