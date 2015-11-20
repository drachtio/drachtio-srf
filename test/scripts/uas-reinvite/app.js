var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('../../..') ;
var srf = new Srf(app) ;
var fs = require('fs') ;
var assert = require('assert'); 
var debug = require('debug')('srf-test') ;

module.exports = function( config ) {

  app.set('api logger',fs.createWriteStream(config.apiLog) ) ;
  config.connect_opts.label = config.label; 
  app.connect(config.connect_opts) ;

  var reinvite = false ;

  app.invite( function(req, res ) {
    srf.createUasDialog( req, res, {
      localSdp: config.sdp
    }, function(err, dialog) {
      assert(!err) ;

      dialog.on('destroy', function() {
        assert(reinvite) ;
        debug('done') ;
      }) ;

      dialog.on('modify', function(req, res) {
        debug('received a modify event') ;
        reinvite = true ;
        res.send(200, {
          body: config.sdp 
        }, function() {
          debug('got ack') ;
        }) ;
      }); 
    }) ;
  }) ;


  return app ;
} ;




