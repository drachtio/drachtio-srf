var assert = require('assert');
var should = require('should');
var debug = require('debug')('drachtio-srf') ;
var drachtio = require('drachtio') ;
var Agent = drachtio.Agent ;
var fixture = require('drachtio-test-fixtures') ;
var uac, uas ;
var cfg = fixture(__dirname,[8050,8051],[6050,6051]) ;

describe('uac / uas scenarios', function() {
    this.timeout(6000) ;

    before(function(done){
        cfg.startServers(done) ;
    }) ;
    after(function(done){
        cfg.stopServers(done) ;
    }) ;
 
    it('should create a UAS dialog and allow remote side to tear down', function(done) {
        var self = this ;
        uac = cfg.configureUac( cfg.client[0], Agent ) ;
        uas = require('../scripts/uas/app')(cfg.client[1]) ;
        cfg.connectAll([uac, uas], function(err){
            if( err ) { throw err ; }

            uac.request({
                uri: cfg.sipServer[1],
                method: 'INVITE',
                body: cfg.client[0].sdp,
                headers: {
                    Subject: self.test.fullTitle()
                }
            }, function( err, req ) {
                should.not.exist(err) ;
                req.on('response', function(res, ack){
                    res.should.have.property('status',200);
                    ack() ; 
                    
                    setTimeout( function(){
                        uac.request({
                            method: 'BYE',
                            stackDialogId: res.stackDialogId
                        }, function(err, bye){
                            should.not.exist(err) ;
                            bye.on('response', function(response){
                                response.should.have.property('status',200);
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
        var self = this ;
        uac = cfg.configureUac( cfg.client[0], Agent ) ;
        uas = require('../scripts/uas-reinvite/app')(cfg.client[1]) ;
        cfg.connectAll([uac, uas], function(err){
            if( err ) { throw err ; }
 
            // send initial INVITE
            uac.request({
                uri: cfg.sipServer[1],
                method: 'INVITE',
                body: cfg.client[0].sdp,
                headers: {
                    Subject: self.test.fullTitle()
                }
            }, function( err, req ) {
                should.not.exist(err) ;
                req.on('response', function(res, ack){
                    res.should.have.property('status',200);
                    ack() ; 

                    // wait, then send re-INVITE
                    setTimeout( function() {
                        uac.request({
                            method: 'INVITE',
                            stackDialogId: res.stackDialogId,
                            body: cfg.client[0].sdp + 'a:inactive'
                        }, function(err, req) {
                            req.on('response', function(res, ack) {
                                res.should.have.property('status',200);
                                ack() ;

                                // wait, then send BYE
                                setTimeout( function(){
                                    uac.request({
                                        method: 'BYE',
                                        stackDialogId: res.stackDialogId
                                    }, function(err, bye){
                                        should.not.exist(err) ;
                                        bye.on('response', function(response){
                                            response.should.have.property('status',200);
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
        var self = this ;
        uac = cfg.configureUac( cfg.client[0], Agent ) ;
        uas = require('../scripts/uas-refresh/app')(cfg.client[1]) ;
        cfg.connectAll([uac, uas], function(err){
            if( err ) { throw err ; }
 
            // send initial INVITE
            uac.request({
                uri: cfg.sipServer[1],
                method: 'INVITE',
                body: cfg.client[0].sdp,
                headers: {
                    Subject: self.test.fullTitle()
                }
            }, function( err, req ) {
                should.not.exist(err) ;
                req.on('response', function(res, ack){
                    res.should.have.property('status',200);
                    ack() ; 

                    // wait, then send a re-INVITE
                    setTimeout( function() {
                        uac.request({
                            method: 'INVITE',
                            stackDialogId: res.stackDialogId,
                            body: cfg.client[0].sdp 
                        }, function(err, req) {
                            req.on('response', function(res, ack) {
                                res.should.have.property('status',200);
                                ack() ;

                                // wait, then send BYE
                                setTimeout( function(){
                                    uac.request({
                                        method: 'BYE',
                                        stackDialogId: res.stackDialogId
                                    }, function(err, bye){
                                        should.not.exist(err) ;
                                        bye.on('response', function(response){
                                            response.should.have.property('status',200);
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
}) ;
