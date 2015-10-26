var client = require('drachtio-client') ;
var Request = client.Request ;
var Response = client.Response ;
var Dialog = require('./dialog') ;
var assert = require('assert') ;
var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var _ = require('lodash') ;
var debug = require('debug')('drachtio-srf') ;

module.exports = exports = Srf ;

/**
 * Creates a signaling resource function library.
 * 
 * @param {drachtio app} app 
 */
function Srf( app ) {
  assert.equal( typeof app, 'function', 'argument \'app\' was not provided or was not a drachtio app') ;

  if (!(this instanceof Srf)) return new Srf(app);

  Emitter.call(this); 

  this._app = app ;
  this.dialogs = {} ;

}
util.inherits(Srf, Emitter) ;

Srf.prototype.createUasDialog = function( req, res, opts, cb ) {
  assert.ok( !!req.msg, 'argument \'req\' must be a drachtio Request') ;
  assert.equal( typeof res.agent, 'object', 'argument \'res\' must be a drachtio Response') ;
  assert.equal( typeof opts, 'object', 'argument \'opts\' must be provided with connection options') ;
  assert.equal( typeof opts.localSdp,'string', 'argument \'opts.localSdp\' was not provided') ;
  assert.equal( typeof cb, 'function', 'a callback function is required'); 

  var self = this ;

  opts.headers = opts.headers || {} ;

  res.send( 200, {
    headers: opts.headers,
    body: opts.localSdp
  }, function(err) {
    if( err ) return cb(err) ;

    var dialog = new Dialog(self, 'uas', {req: req, res: res} ) ;
    self.dialogs[res.stackDialogId] = dialog ;
    cb( null, dialog ) ;
  }); 
} ;

Srf.prototype.dialog = function(opts) {
  var self = this ;

  return function(req, res, next) {

    if( req.stackDialogId && req.stackDialogId in self.dialogs) {
      var dialog = self.dialogs[req.stackDialogId] ;
      dialog.handle( req, res, next) ;
      return ;
    }
    next() ;
  } ;
} ;

Srf.prototype.addDialog = function( dialog ) {
  this.dialogs[dialog.id] = dialog ;
  debug('Srf#addDialog: dialog count is now %d ', _.keys( this.dialogs ).length ) ;
} ;
Srf.prototype.removeDialog = function( dialog ) {
  delete this.dialogs[dialog.id] ;
  debug('Srf#removeDialog: dialog count is now %d', _.keys( this.dialogs ).length ) ;
} ;
