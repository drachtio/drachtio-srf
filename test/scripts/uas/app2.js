const Srf = require('../../..') ;
const assert = require('assert'); 
const debug = require('debug')('srf-test') ;

module.exports = function( config ) {

  config.connect_opts.label = config.label; 
  const srf = new Srf();
  srf.connect(config.connect_opts) ;
  srf.set('api logger',config.apiLog ) ;

  srf.invite( ( req, res ) => {
    srf.createUasDialog( req, res, {
      localSdp: config.sdp
    }, (err, dialog) => {
      assert(!err) ;

      dialog.on('destroy', function() {
        debug('done') ;
      }) ;
    }) ;
  }) ;

  return srf ;
} ;




