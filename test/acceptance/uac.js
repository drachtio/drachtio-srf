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
describe('createUAC', function() {
  this.timeout(6000) ;

  debug('test...');
  before(function(done) {
    cfg.startServers(done) ;
  }) ;
  after(function(done) {
    cfg.stopServers(done) ;
  }) ;

  it('should handle auth challenge', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uac.set('api logger', cfg.client[0].apiLog) ;

    uas = require('../scripts/uas/app2')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err;  }
      uac.createUAC(cfg.sipServer[1], {
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
      })
        .then((dlg) => {
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        })
        .catch((err) => {
          console.log(err);
        });
    }) ;
  }) ;

  it('should support promises-based call', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app5')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      })
        .then((dlg) => {
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        })
        .catch((err) => {
          console.log(err);
        });
    }) ;
  }) ;

  it('should support callback Srf#createUAC(uri, opts, cbRequest, cbProvisional, callback)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app15')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, undefined, undefined, (err, dlg) => {
        should.not.exist(err) ;
        dlg.destroy((err, bye) => {
          bye.on('response', function() {
            should.not.exist(err) ;
            uac.idle.should.be.true ;
            done() ;
          }) ;
        }) ;
      });
    }) ;
  }) ;

  it('should support callback Srf#createUAC(uri, opts, {}, callback)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app21')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, {}, (err, dlg) => {
        should.not.exist(err) ;
        dlg.destroy((err, bye) => {
          bye.on('response', function() {
            should.not.exist(err) ;
            uac.idle.should.be.true ;
            done() ;
          }) ;
        }) ;
      });
    }) ;
  }) ;

  it('should support callback providing request sent Srf#createUAC(uri, opts, cbRequest)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app17')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      let sent = false ;
      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, () => {
        sent = true;
      })
        .then((dlg) => {
          should.not.exist(err) ;
          sent.should.be.true;
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        });
    }) ;
  }) ;

  it('should support callback providing provisional response Srf#createUAC(uri, opts, cbRequest, cbProvisional)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app18')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      let sent = false ;
      let provisional = false ;
      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, () => {
        sent = true;
      }, (prov) => {
        prov.should.have.property('status', 180);
        provisional = true ;
      })
        .then((dlg) => {
          should.not.exist(err) ;
          sent.should.be.true;
          provisional.should.be.true;
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        });
    }) ;
  }) ;

  it('should support callback providing request sent Srf#createUAC(uri, {cbRequest}, cbOpts)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app19')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      let sent = false ;
      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, {
        cbRequest: () => {
          sent = true ;
        }
      })
        .then((dlg) => {
          should.not.exist(err) ;
          sent.should.be.true;
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        });
    }) ;
  }) ;

  it('should support callback providing provisional response Srf#createUAC(uri, {cbProvisional}, cbOpts)', function(done) {
    uac = new Srf();
    uac.connect(cfg.client[0].connect_opts) ;
    uas = require('../scripts/uas/app20')(cfg.client[1]) ;
    cfg.connectAll([uac, uas], (err) => {
      if (err) { throw err ; }

      let sent = false ;
      let provisional = false ;
      uac.createUAC(cfg.sipServer[1], {
        method: 'INVITE',
        headers: {
          To: 'sip:dhorton@sip.drachtio.org',
          From: 'sip:dhorton@sip.drachtio.org',
          Contact: '<sip:dhorton@sip.drachtio.org>;expires=30',
          Subject: this.test.fullTitle()
        }
      }, {
        cbRequest: () => {
          sent = true ;
        },
        cbProvisional: (prov) => {
          prov.should.have.property('status', 180);
          provisional = true ;
        }
      })
        .then((dlg) => {
          should.not.exist(err) ;
          sent.should.be.true;
          provisional.should.be.true;
          dlg.destroy((err, bye) => {
            bye.on('response', function() {
              should.not.exist(err) ;
              uac.idle.should.be.true ;
              done() ;
            }) ;
          }) ;
        });
    }) ;
  }) ;

});
