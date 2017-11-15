var Srf = require('../../..') ;
var srf = new Srf() ;
var fs = require('fs') ;

module.exports = (config) => {

  srf.set('api logger', fs.createWriteStream(config.apiLog)) ;
  config.connect_opts.label = config.label;
  srf.connect(config.connect_opts) ;

  srf.subscribe((req, res) => {

    srf.createUAS(req, res, {
    }, (err, dialog) => {
      if (err) throw err ;
      dialog.destroy() ;
    });
  }) ;

  return srf ;
};
