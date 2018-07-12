const Emitter = require('events');
const Srf = require('../..');
const config = require('config');
const debug = require('debug')('drachtio:test');

class App extends Emitter {
  constructor() {
    super();

    this.srf = new Srf() ;
    this.srf.connect(config.get('drachtio-sut'));
  }

  proxyPromise(dest) {
    this.srf.invite((req, res) => {
      this.srf.proxyRequest(req, dest, {remainInDialog: true})
        .then((results) => {
          this.emit('proxy', results)
        });
    });
  }

  proxyCb(dest) {
    this.srf.invite((req, res) => {
      this.srf.proxyRequest(req, dest, {remainInDialog: true}, (err, results) => {
        this.emit('proxy', results);
      });
    });
  }

  disconnect() {
    debug('disconnecting from drachtio');
    this.srf.disconnect();
    return this;
  }
}

module.exports = App;
