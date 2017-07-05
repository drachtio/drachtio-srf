var Srf = require('../../..') ;
var assert = require('assert');
var debug = require('debug')('srf-test') ;

module.exports = function(config) {

  var srf = new Srf(config.connect_opts) ;
  srf.locals.title = 'locals';
  srf.set('api logger', config.apiLog) ;
  config.connect_opts.label = config.label;

  srf.invite((req, res) => {
    debug('received invite');
    assert(req.app.locals.title = 'locals');
    srf.createUasDialog(req, res, {
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
