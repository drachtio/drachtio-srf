var Srf = require('../../..') ;
var srf = new Srf() ;
var fs = require('fs') ;

module.exports = function(config) {

  srf.set('api logger', fs.createWriteStream(config.apiLog)) ;
  config.connect_opts.label = config.label;
  srf.connect(config.connect_opts) ;

  srf.invite((req, res) => {
    res.send(503);
  }) ;


  return srf ;
} ;
