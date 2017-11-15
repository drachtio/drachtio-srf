var drachtio = require('drachtio') ;
var Srf = require('../../..') ;
var srf = new Srf() ;
var fs = require('fs') ;
var assert = require('assert'); 
var debug = require('debug')('srf-test') ;

module.exports = function( config ) {

  srf.set('api logger',fs.createWriteStream(config.apiLog) ) ;
  config.connect_opts.label = config.label; 
  srf.connect(config.connect_opts) ;

  var refresh = false ;

  srf.invite( function(req, res ) {
    srf.createUasDialog( req, res, {
      localSdp: config.sdp
    }, function(err, dialog) {
      assert(!err) ;

      dialog.on('destroy', function() {
        assert(refresh) ;
        debug('done') ;
      }) ;

      dialog.on('refresh', function(msg) {
        debug('received a refresh event: ', JSON.stringify(msg)) ;
        refresh = true ;
      }); 
    }) ;
  }) ;


  return srf ;
} ;




