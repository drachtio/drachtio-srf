const Srf = require('../../..') ;
const assert = require('assert'); 

module.exports = function( config ) {

  config.connect_opts.label = config.label; 
  const srf = new Srf()
  srf.connect(config.connect_opts) ;
  srf.set('api logger',config.apiLog ) ;

  srf.invite( ( req, res ) => {

    srf.createBackToBackDialogs( req, res, config.b2bTarget, {}, (err, uasDialog, uacDialog) => {

      assert( err.status === 487 ) ;
    }) ;

  }) ;

  return srf ;
} ;




