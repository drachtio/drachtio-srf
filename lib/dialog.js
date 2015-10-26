var Emitter = require('events').EventEmitter ;
var util = require('util') ;
var assert = require('assert') ;
var noop = require('node-noop').noop;
var debug = require('debug')('drachtio-srf') ;

module.exports = exports = Dialog ;

function Dialog( srf, type, opts ) {
  var types = ['uas','uac'] ;
  assert.ok( -1 !== types.indexOf(type), 'argument \'type\' must be one of ' + types.join(',')) ;

  if (!(this instanceof Dialog)) return new Dialog( srf, type, opts );

  Emitter.call(this); 

  this.srf = srf ;
  this.type = type ;
  this.req = opts.req ;
  this.res = opts.res ;
  this.agent = this.req.agent ;

  Object.defineProperty(this, 'id',  {
    get: function() {
      return 'uas' === this.type ? this.res.stackDialogId : 'XXXX';
    }
  }) ;

  this.srf.addDialog(this) ; 
}
util.inherits(Dialog, Emitter) ;

Dialog.prototype.destroy = function(cb) {
  cb = cb || noop ;
  var self = this ;
  this.agent.request({
    method: 'BYE',
    stackDialogId: self.id
  }, function(err, bye) {
    self.srf.removeDialog( self ) ;
    cb(err, bye) ;
  }) ;
} ;

Dialog.prototype.handle = function( req, res, next ) {
  switch( req.method ) {
    case 'BYE': 
      this.srf.removeDialog( this ) ;
      res.send(200) ;
      this.emit('destroy', {
        msg: req.msg
      }) ;
      break ;

    case 'INFO':
    case 'NOTIFY':
      this.emit('msg', req, res ) ;
      break ;

    default:
      console.error('Dialog#handle unhandled method: %s', req.method) ;
  }
} ;
