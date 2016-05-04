var drachtio = require('drachtio');
var app = drachtio() ;
var Srf = require('..') ;
var srf = new Srf(app) ;
var argv = require('minimist')(process.argv.slice(2));
var _ = require('lodash') ;
var assert = require('assert') ;

assert.ok( _.isArray( argv._) && argv._.length > 0 , 'No far end gateway/proxy specified; e.g. usage is node simple-b2bua uri1 uri2 ...' ) ;
var dest =  argv._ ;

app.use(srf.dialog()) ;

app.invite( function( req, res) {

  srf.createBackToBackDialogs(req, res, dest, function(err, uas, uac) {
    if( err ) {
      console.log('failed to set up call: ', err) ;
      return ;
    }

    console.log('successfully set up call') ;

    uac.on('destroy', function() { uas.destroy() ;}) ;
    uas.on('destroy', function() { uac.destroy() ;}) ;

  }) ;
}) ;

app.connect({
  host: '127.0.0.1',
  port: 8022,
  secret: 'cymru'
}) ;

