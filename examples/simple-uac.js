var drachtio = require('drachtio');
var app = drachtio() ;
var Srf = require('..') ;
var srf = new Srf(app) ;
var debug = require('debug')('drachtio-srf') ;

app.use(srf.dialog()) ;

app.invite( function( req, res) {


  srf.createUacDialog( '127.0.0.1:5061', {
    calledNumber: 'drachtio',
    localSdp: req.msg.body
  }, function(err, dialog ) {
    if( err ) {
      console.error('failed creating dialog: ' + JSON.stringify(err)) ;
      throw err ;
    }
    debug('created uac dialog: ', dialog);

    srf.createUasDialog( req, res, {
      localSdp: dialog.remote.sdp
    }, function(err, dialog) {
      if( err ) {
        console.error('failed creating dialog: ' + JSON.stringify(err)) ;
        throw err ;
      }

      //dialog.destroy() ;
      

      dialog.on('destroy', destroy.bind( dialog )) ;

    }) ;
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
