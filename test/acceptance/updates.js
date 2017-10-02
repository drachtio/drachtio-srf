const should = require('should');
const drachtio = require('drachtio') ;
const Agent = drachtio.Agent ;
const fixture = require('drachtio-test-fixtures') ;
let uac, uas;
const cfg = fixture(__dirname, [8060, 8061, 8062], [6060, 6061, 6062]) ;
var Srf = require('../..') ;
const debug = require('debug')('drachtio-srf');
const async = require('async') ;
const assert = require('assert');

function destroyAll(uas) {
  return new Promise((resolve, reject) => {
    async.each(uas, (ua, callback) => {
      ua.destroy(() => {
        callback() ;
      });
    }, () => {
      resolve();
    });
  });
}
describe('uac / uas scenarios with newer method signatures', function() {
  this.timeout(6000) ;

  debug('test...');
  before(function(done) {
    cfg.startServers(done) ;
  }) ;
  after(function(done){
    cfg.stopServers(done) ;
  }) ;

  it.only('Srf#createB2B should work for successful call', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app6')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2])
          .then(({uas, uac}) => {

            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });

          })
          .catch((err) => {
            throw err;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 200);
          ack() ;
        });
      });
    });
  });

  it('Srf#createB2B should work for failed UAC call', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app7')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2])
          .then(({uas, uac}) => {
            assert('unexpected success - should have failed with 503');
          })
          .catch((err) => {
            err.status.should.eql(503);
            uac.should.be.idle;
            uas.should.be.idle;

            done() ;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 503);
          ack() ;
        });
      });
    });
  });

  it('Srf#createB2B should handle CANCEL', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app8')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2])
          .then(({uas, uac}) => {
            assert('unexpected success - should have failed with 503');
          })
          .catch((err) => {
            err.status.should.eql(487);
            uac.should.be.idle;
            uas.should.be.idle;

            done() ;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        setTimeout(() => {
          req.cancel() ;
        }, 30);
      });
    });
  });

  it('Srf#createB2B should include headers from uas leg onto uac leg', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app9')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {
          proxyRequestHeaders: ['Subject'],
          proxyResponseHeaders: ['Subject']
        })
          .then(({uas, uac}) => {
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });

          })
          .catch((err) => {
            throw err;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 200);
          res.get('Subject').should.exist;
          ack() ;
        });
      });
    });
  });
  it('Srf#createB2B should support SDP provided as string', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app10')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {
          localSdpA: req.body
        })
          .then(({uas, uac}) => {
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });

          })
          .catch((err) => {
            throw err;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 200);
          res.body.should.eql(cfg.client[0].sdp);
          ack() ;
        });
      });
    });
  });

  it('Srf#createB2B should support SDP provided as promise', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app11')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      function promiseSdp(sdp) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve(sdp) ;
          }, 10);
        });
      }

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {
          localSdpA: promiseSdp.bind(null, req.body)
        })
          .then(({uas, uac}) => {
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });

          })
          .catch((err) => {
            throw err;
          });
      });

      uac.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 200);
          res.body.should.eql(cfg.client[0].sdp);
          ack() ;
        });
      });
    });
  });
});
