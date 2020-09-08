var drachtio = require('drachtio-srf');
var app = drachtio() ;
var Srf = require('..') ;
var srf = new Srf(app) ;
var debug = require('debug')('drachtio-srf') ;

app.use(srf.dialog()) ;

app.invite( function( req, res) {

  var opts = {
    localSdp: req.msg.body.replace(/^c=IN IP4 .*$/m,'c=IN IP4 0.0.0.0'),
    headers: {
      'User-Agent': 'simple-uas'
    }
  } ;

  srf.createUasDialog( req, res, opts, function(err, dialog) {
    if( err ) { throw err ; }

    debug('dialog: ', JSON.stringify(dialog)) ;
    

    setTimeout( function() {
      dialog.modifySession('hold', function(err) {
        if( err ) { throw err ;}
        debug('successfully put dialog on hold') ;

        setTimeout( function() {
          dialog.modifySession('unhold', function(err) {
            if( err ) { throw err; }
            debug('successfully took dialog off hold') ;
          }) ;
        }, 2000) ;
      }) ;
    }, 2000) ;
    

    dialog.on('destroy', destroy.bind( dialog )) ;
  }) ;
}) ;

app.connect({
  host: '127.0.0.1',
  port: 8022,
  secret: 'cymru'
}) ;

function destroy() {
  debug('dialog ended') ;
}
