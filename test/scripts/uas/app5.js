var drachtio = require('drachtio') ;
var app = drachtio() ;
var Srf = require('../../..') ;
var srf = new Srf(app) ;
var fs = require('fs') ;
var debug = require('debug')('srf-test') ;

module.exports = (config) => {

  app.set('api logger', fs.createWriteStream(config.apiLog)) ;
  config.connect_opts.label = config.label;
  app.connect(config.connect_opts) ;

  app.invite((req, res) => {

    srf.createUAS(req, res, {
      localSdp: config.sdp
    })
      .then((dialog) => {
        dialog.on('destroy', () => {
          debug('done') ;
        }) ;
      }) ;
  }) ;

  return app ;
};
