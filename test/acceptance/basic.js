const should = require('should');
const drachtio = require('drachtio') ;
const Agent = drachtio.Agent ;
const fixture = require('drachtio-test-fixtures') ;
let uac, uas, b2b ;
const cfg = fixture(__dirname, [8060, 8061, 8062], [6060, 6061, 6062]) ;
var Srf = require('../..') ;
const debug = require('debug')('drachtio-srf');

describe('uac / uas scenarios', function() {
  this.timeout(6000) ;

  before(function(done){
    cfg.startServers(done) ;
  }) ;
  after(function(done){
    cfg.stopServers(done) ;
  }) ;

  it('Srf#createUacDialog should handle auth challenge', function(done) {
    uac = new Srf(cfg.client[0].connect_opts) ;
    uac.set('api logger', cfg.client[0].apiLog) ;

    uas = require('../scripts/uas/app2')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err;  }
      uac.createUacDialog(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        },
        auth: {
          username: 'dhorton',
          password: '1234'
        }
      }, (err, dlg) => {
        should.not.exist(err) ;
        dlg.destroy((err, bye) => {
          bye.on('response', function() {
            should.not.exist(err) ;
            uac.idle.should.be.true ;
            done() ;
          }) ;
        }) ;
      }) ;
    }) ;
  }) ;

  it('should support app locals', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app3')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      debug('connectAll succeeded');
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

          setTimeout(() => {
            uac.request({
              method: 'BYE',
              stackDialogId: res.stackDialogId
            }, (err, bye) => {
              should.not.exist(err) ;
              bye.on('response', (response) => {
                response.should.have.property('status', 200);
                uac.idle.should.be.true ;
                done() ;
              }) ;
            }) ;
          }, 1) ;
        }) ;
      }) ;
    }) ;
  }) ;
  it('should create a UAS dialog and allow remote side to tear down', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

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

          setTimeout(() => {
            uac.request({
              method: 'BYE',
              stackDialogId: res.stackDialogId
            }, (err, bye) => {
              should.not.exist(err) ;
              bye.on('response', (response) => {
                response.should.have.property('status', 200);
                uac.idle.should.be.true ;
                done() ;
              }) ;
            }) ;
          }, 1) ;
        }) ;
      }) ;
    }) ;
  }) ;
  it('should trigger a modify event when a re-INVITE is received', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas-reinvite/app')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      // send initial INVITE
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

          // wait, then send re-INVITE
          setTimeout(() => {
            uac.request({
              method: 'INVITE',
              stackDialogId: res.stackDialogId,
              body: cfg.client[0].sdp + 'a:inactive'
            }, (err, req) => {
              req.on('response', (res, ack) => {
                res.should.have.property('status', 200);
                ack() ;

                // wait, then send BYE
                setTimeout(() => {
                  uac.request({
                    method: 'BYE',
                    stackDialogId: res.stackDialogId
                  }, (err, bye) => {
                    should.not.exist(err) ;
                    bye.on('response', (response) => {
                      response.should.have.property('status', 200);
                      uac.idle.should.be.true ;
                      done() ;
                    }) ;
                  }) ;
                }, 1) ;
              }) ;
            }) ;
          }, 10);
        }) ;
      }) ;
    }) ;
  }) ;

  it('should trigger a refresh event when a refreshing re-INVITE is received', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas-refresh/app')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      // send initial INVITE
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

          // wait, then send a re-INVITE
          setTimeout(() => {
            uac.request({
              method: 'INVITE',
              stackDialogId: res.stackDialogId,
              body: cfg.client[0].sdp
            }, (err, req) => {
              req.on('response', (res, ack) => {
                res.should.have.property('status', 200);
                ack() ;

                // wait, then send BYE
                setTimeout(() => {
                  uac.request({
                    method: 'BYE',
                    stackDialogId: res.stackDialogId
                  }, (err, bye) => {
                    should.not.exist(err) ;
                    bye.on('response', (response) => {
                      response.should.have.property('status', 200);
                      uac.idle.should.be.true ;
                      done() ;
                    }) ;
                  }) ;
                }, 1) ;
              }) ;
            }) ;
          }, 10);
        }) ;
      }) ;
    }) ;
  }) ;
  it('new Srf() should work with connect opts instead of app', function(done) {
    const srf = new Srf(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app2')(cfg.client[1]) ;
    cfg.connectAll([srf, uas], (err) => {
      if (err) { throw err ; }

      srf.createUacDialog({
        uri: cfg.sipServer[1],
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, dialog) => {
        should.not.exist(err) ;
        dialog.destroy() ;
        done() ;
      }) ;
    }) ;
  }) ;
  it('Srf#createBackToBackDialogs should handle CANCEL during outdial', function(done) {
    var srf = new Srf(cfg.client[0].connect_opts) ;
    b2b = require('../scripts/uas/b2b')(Object.assign({b2bTarget: cfg.sipServer[2]}, cfg.client[1])) ;
    uas = require('../scripts/uas/app4')(cfg.client[2]) ;
    cfg.connectAll([srf, uas], (err) => {
      if (err) { throw err ; }
      srf.request({
        uri: cfg.sipServer[1],
        method: 'INVITE',
        body: cfg.client[0].sdp,
        headers: {
          Subject: this.test.fullTitle()
        }
      }, (err, req) => {
        should.not.exist(err) ;

        req.on('response', (response) => {
          if (response.status < 200) { return; }
          response.status.should.eql(487);

          // need to leave a little time for the B2BUA to finish its work
          setTimeout(() => {
            srf.idle.should.be.true ;
            uas.idle.should.be.true ;
            b2b.idle.should.be.true ;

            done() ;
          }, 750) ;
        }) ;
        setTimeout(() => { req.cancel(); }, 450) ;
      }) ;
    }) ;
  }) ;
}) ;
