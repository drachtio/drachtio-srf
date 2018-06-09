const Emitter = require('events');
const Srf = require('../..');
const config = require('config');
const debug = require('debug')('drachtio:test');

class App extends Emitter {
  constructor() {
    super();

    this.srf = new Srf('tag1') ;
    this.srf.connect(config.get('drachtio-sut'));
  }

  reject(code, headers) {
    this.srf.invite((req, res) => {
      res.send(code, {headers});
    });
    return this;
  }

  accept(sdp, useBody) {
    this.srf.invite((req, res) => {

      req.on('cancel', () => {
        req.canceled = true;
      });
      const localSdp = sdp || req.body.replace(/m=audio\s+(\d+)/, 'm=audio 15000');

      if (req.canceled) return;

      const opts = {};
      if (useBody) Object.assign(opts, {body: localSdp});
      else Object.assign(opts, {localSdp});

      this.srf.createUAS(req, res, opts)
        .then((uas) => {
          this.emit('connected', uas);
          return;
        })
        .catch((err) => {
          console.error(`Uas: failed to connect: ${err}`);
          this.emit('error', err);
        });
    });

    return this;
  }

  acceptCb(callback) {
    this.srf.invite((req, res) => {

      req.on('cancel', () => {
        req.canceled = true;
      });
      const localSdp = req.body.replace(/m=audio\s+(\d+)/, 'm=audio 15000');

      if (req.canceled) return;

      this.srf.createUAS(req, res, {localSdp}, (err, uas) => {
        if (err) {
          console.error(`Uas: failed to connect: ${err}`);
        }
        return;
      });
    });

    return this;
  }

  acceptSubscribe() {
    this.srf.subscribe((req, res) => {

      this.srf.createUAS(req, res)
        .then((uas) => {
          this.emit('connected', uas);
          return;
        })
        .catch((err) => {
          console.error(`Uas: failed to connect: ${err}`);
          this.emit('error', err);
        });
    });

    return this;
  }

  disconnect() {
    debug('disconnecting from drachtio');
    this.srf.disconnect();
    return this;
  }
}

module.exports = App;
