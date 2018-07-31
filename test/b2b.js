const test = require('blue-tape');
const { output, sippUac } = require('./sipp')('test_testbed');
const B2b = require('./scripts/b2b');
const debug = require('debug')('drachtio:test');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('B2B', (t) => {
  t.timeoutAfter(60000);

  let b2b = new B2b();
  b2b.on('connected', ({uas, uac}) => {
    uas.on('destroy', () => {
      //console.log('got BYE from A sending to B');
      uac.destroy();
    });
  });

  Promise.resolve()

    // 200 OK from B
    .then(() => {
      debug('starting sipp');
      return b2b.expectSuccess('sip:sipp-uas');
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
