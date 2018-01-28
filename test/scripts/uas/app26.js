var Srf = require('../../..') ;
var srf = new Srf() ;
var fs = require('fs') ;
var debug = require('debug')('srf-test') ;
var assert = require('assert');

module.exports = (config) => {

  srf.set('api logger', fs.createWriteStream(config.apiLog)) ;
  config.connect_opts.label = config.label;
  srf.connect(config.connect_opts) ;

  srf.invite((req, res) => {

    res.send(183, {localSdp: config.sdo});

    srf.createUAS(req, res, {
      localSdp: config.sdp
    }, (err, dialog) => {
      assert(!err);
      dialog.on('destroy', () => {
        debug('done') ;
      }) ;
    });
  }) ;

  return srf ;
};
