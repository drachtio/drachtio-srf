var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('../../..') ;
var srf = new Srf(app) ;
var assert = require('assert'); 
var debug = require('debug')('srf-test') ;
var assert = require('assert');

srf.locals.title = 'locals';

module.exports = function( config ) {

  app.set('api logger',config.apiLog) ;
  config.connect_opts.label = config.label; 
  srf.connect(config.connect_opts) ;

  app.invite( function(req, res ) {
    assert(req.app.locals.title = 'locals');
    srf.createUasDialog( req, res, {
      localSdp: config.sdp
    }, function(err, dialog) {
      assert(!err) ;

      dialog.on('destroy', function() {
        debug('done') ;
      }) ;
    }) ;
  }) ;


  return srf ;
} ;




