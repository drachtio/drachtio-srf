var drachtio = require('drachtio');
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
    if( err ) throw err ;

    //dialog.destroy() ;
    

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
