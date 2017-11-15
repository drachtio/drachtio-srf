const Srf = require('../../..') ;
const assert = require('assert'); 
const debug = require('debug')('srf-test') ;

module.exports = function( config ) {

  config.connect_opts.label = config.label; 
  let srf = new Srf();
  srf.connect(config.connect_opts) ;
  srf.set('api logger',config.apiLog ) ;

  srf.invite( ( req, res ) => {
    res.send(180) ;

    req.on('cancel', () => {
      res.send(487) ;
    }) ;
  }) ;

  return srf ;
} ;




