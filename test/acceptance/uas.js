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
describe('createUAS', function() {
  this.timeout(6000) ;

  before(function(done) {
    cfg.startServers(done) ;
  }) ;
  after(function(done){
    cfg.stopServers(done) ;
  }) ;
  

  it('createUAS returning a promise', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app5')(cfg.client[1]) ;
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

  it('createUAS taking a callback', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app12')(cfg.client[1]) ;
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

  it('opts.body is an alias for opts.localSdp', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app13')(cfg.client[1]) ;
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

  it('creates dialog for SUBCRIBE', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app14')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      // uas.destroy for a SUBSCRIBE dialog will send a NOTIFY
      uac.set('handler', (req, res) => {
        if (req.method === 'NOTIFY') {
          res.send(200);
          uac.idle.should.be.true ;
          done() ;
        }
      }) ;

      uac.request({
        uri: cfg.sipServer[1],
        method: 'SUBSCRIBE',
        headers: {
          Subject: this.test.fullTitle(),
          Event: 'message-summary',
          Accept: 'application/simple-message-summary'
        }
      }, (err, req) => {
        should.not.exist(err) ;
        req.on('response', (res, ack) => {
          res.should.have.property('status', 202);
        }) ;
      }) ;
    }) ;
  }) ;

  it('it should handle sending 183 and then 200', function(done) {
    uac = cfg.configureUac(cfg.client[0], Agent) ;
    uas = require('../scripts/uas/app27')(cfg.client[1]) ;
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


});
