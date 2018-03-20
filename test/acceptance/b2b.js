const should = require('should');
const drachtio = require('drachtio') ;
const Agent = drachtio.Agent ;
const fixture = require('drachtio-test-fixtures') ;
let uac, uas;
const cfg = fixture(__dirname, [8060, 8061, 8062], [6060, 6061, 6062]) ;
var Srf = require('../..') ;
const debug = require('debug')('drachtio-srf:test');
const async = require('async') ;
const assert = require('assert');
const Dialog = Srf.Dialog;
const parseUri = Srf.parseUri;

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

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
describe('createB2BUA', function() {
  this.timeout(6000) ;

  debug('test...');
  before(function(done) {
    cfg.startServers(done) ;
  }) ;
  after(function(done){
    cfg.stopServers(done) ;
  }) ;

  it('should provide Srf.parseUri', (done) => {
    const uri = parseUri('sip:1234@10.101.10.1;transport=udp');
    uri.should.have.property('params');
    done();
  });
  it('should provide Srf.SipError', (done) => {
    const err = new Srf.SipError();
    err.should.be.an.instanceOf(Error);
    done();
  });
  it('should work for successful call', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app6')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2])
          .then(({uas, uac}) => {

            debug(`${this.test.fullTitle()} call connected`);
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                debug(`${this.test.fullTitle()} calling done`);
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

  it('should work for failed call', function(done) {
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
            debug(`${this.test.fullTitle()} call failed as expected`);

            err.status.should.eql(503);
            uac.should.be.idle;
            uas.should.be.idle;
            debug(`${this.test.fullTitle()} calling done`);
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

  it('should not propagate failure if so configured', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app28')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {
          passFailure: false
        })
          .then(({uas, uac}) => {
            assert('unexpected success - should have failed with 503');
          })
          .catch((err) => {
            err.status.should.eql(503);
            res.send(480);
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
        req.on('response', (res) => {
          res.should.have.property('status', 480);
          debug(`${this.test.fullTitle()} calling done`);
          done() ;
        });
      });
    });
  });

  it('should handle CANCEL during call setup', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app8')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2])
          .then(({uas, uac}) => {
            assert('unexpected success - should have failed with 487');
          })
          .catch((err) => {
            err.status.should.eql(487);
            uac.should.be.idle;
            uas.should.be.idle;

            debug(`${this.test.fullTitle()} calling done`);
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

  it('should propagate headers from UAS onto UAC', function(done) {
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
                debug(`${this.test.fullTitle()} calling done`);
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
  it('should allow SDP to be provided as string', function(done) {
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
                debug(`${this.test.fullTitle()} calling done`);
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

  it('should allow SDP to be provided as a function returning a promise', function(done) {
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
                debug(`${this.test.fullTitle()} calling done`);
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

  it('should support callback Srf#createB2BUA(req, res, uri, opts, undefined, undefined, callback)', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app22')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {}, null, null, (err, {uas, uac}) => {
          should.not.exist(err) ;
          destroyAll([uac, uas])
            .then(() => {
              uac.should.be.idle;
              uas.should.be.idle;
              done() ;
            });
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

  it('should support cbFinalizedUac callback to provide early access to uac: Srf#createB2BUA(req, res, opts, {cbFinalizedUac})', function(done) {
    const srf = new Srf() ;
    let gotUac = false ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app23')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, {uri: cfg.sipServer[2]}, {cbFinalizedUac: (uac) => {
          uac.should.be.an.instanceOf(Dialog);
          gotUac = true ;
        }})
          .then(({uas, uac}) => {
            should.not.exist(err) ;
            gotUac.should.be.true;
            uac.should.be.an.instanceOf(Dialog);
            uas.should.be.an.instanceOf(Dialog);
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });
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

  it('should support cbRequest and cbProvisional callbacks: Srf#createB2BUA(req, res, uri, opts, {cbRequest, cbProvisional})', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app25')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      let gotRequest = false ;
      let gotProvisional = false ;

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, cfg.sipServer[2], {},
          {
            cbRequest: (sent) => {
              gotRequest = true ;
            },
            cbProvisional: (prov) => {
              gotProvisional = true ;
            }
          })
          .then(({uas, uac}) => {
            should.not.exist(err) ;
            gotRequest.should.be.true ;
            gotProvisional.should.be.true ;
            uac.should.be.an.instanceOf(Dialog);
            uas.should.be.an.instanceOf(Dialog);
            destroyAll([uac, uas])
              .then(() => {
                uac.should.be.idle;
                uas.should.be.idle;
                done() ;
              });
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
          if (res.status === 200) ack() ;
        });
      });
    });
  });

  it('should work for signature Srf#createB2BUA(req, res, {uri})', function(done) {
    const srf = new Srf() ;
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    srf.connect(cfg.client[1].connect_opts);
    uas = require('../scripts/uas/app24')(cfg.client[2]) ;
    cfg.connectAll([uac, srf, uas], (err) => {
      assert(!err);

      srf.invite((req, res) => {
        srf.createB2BUA(req, res, {uri: cfg.sipServer[2]})
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

});
