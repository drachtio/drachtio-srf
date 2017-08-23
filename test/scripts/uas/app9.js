var Srf = require('../../..') ;
var srf = new Srf() ;
var fs = require('fs') ;
var debug = require('debug')('srf-test') ;

module.exports = (config) => {

  srf.set('api logger', fs.createWriteStream(config.apiLog)) ;
  config.connect_opts.label = config.label;
  srf.connect(config.connect_opts) ;

  srf.invite((req, res) => {

    srf.createUAS(req, res, {
      localSdp: config.sdp,
      headers: {
        'Subject': req.get('Subject')
      }
    })
      .then((dialog) => {
        dialog.on('destroy', () => {
          debug('done') ;
        }) ;
      }) ;
  }) ;

  return srf ;
};
