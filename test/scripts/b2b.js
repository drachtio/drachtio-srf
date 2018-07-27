const Emitter = require('events');
const Srf = require('../..');
const config = require('config');
const debug = require('debug')('drachtio:test');

class App extends Emitter {
  constructor() {
    super();

    this.srf = new Srf(['tag1', 'tag2']) ;
    this.srf.connect(config.get('drachtio-sut'));
    this.srf.on('error', (err) => { this.emit('error', err);});
  }

  setRequestHeaders(hdrs) {
    this.requestHeaders = hdrs;
    console(`request headers to pass ${hdrs}`);
  }

  setResponseHeaders(hdrs) {
    this.responseHeaders = hdrs;
  }

  expectCancel(uri) {
    this.srf.invite((req, res) => {

      this.srf.createB2BUA(req, res, uri)
        .then(({uas, uac}) => {
          throw new Error('unexpected dialog success - expected CANCEL from uac');
        })
        .catch((err) => {
          debug(`expectCancel: expected a final 487, got ${err}`);
          if (err.status === 487) return;
          throw err;
        });
    });
  }

  expectFailure(uri, status, newStatus) {
    this.srf.invite((req, res) => {

      if (newStatus) {
        this.srf.createB2BUA(req, res, uri, {passFailure: false})
          .then(({uas, uac}) => {
            throw new Error('unexpected dialog success');
          })
          .catch((err) => {
            debug(`expectCancel: expected a final ${status}, got ${err}`);
            if (err.status !== status) throw err;
            res.send(newStatus);
          });
      }
      else {
        this.srf.createB2BUA(req, res, uri)
          .then(({uas, uac}) => {
            throw new Error('unexpected dialog success - expected CANCEL from uac');
          })
          .catch((err) => {
            debug(`expectCancel: expected a final 487, got ${err}`);
            if (err.status === status) return;
            throw err;
          });
      }
    });
  }

  expectSuccess(uri, opts = {}) {
    this.srf.invite((req, res) => {

      this.srf.createB2BUA(req, res, uri, opts, {
        cbRequest: (err, uacRequest) => {
          //console.log(`sent request with Subject: ${uacRequest.get('Subject')}`);
        },
        cpProvisional: (provisionalResponse) => {

        }
      })
        .then(({uas, uac}) => {
          this.emit('connected', {uas, uac});
          return;
        })
        .catch((err) => {
          throw err;
        });
    });
  }

  uriInOpts(uri) {
    this.srf.invite((req, res) => {

      this.srf.createB2BUA(req, res, { uri })
        .then(({uas, uac}) => {
          this.emit('connected', {uas, uac});
          return;
        })
        .catch((err) => {
          throw err;
        });
    });
  }

  passHeaders(uri) {
    let uacFinalized = false;
    this.srf.invite((req, res) => {

      const subject = req.get('Subject');
      this.srf.createB2BUA(req, res, uri, {
        proxyRequestHeaders: ['Subject'],
        proxyResponseHeaders: ['Subject']
      }, {
        cbRequest: (err, uacRequest) => {
          if (uacRequest.get('Subject') !== subject) throw new Error('request header not proxied');
        },
        cbProvisional: (provisionalResponse) => {
          if (provisionalResponse.get('Subject') !== subject) throw new Error('response header not proxied');
        },
        cbFinalizedUac: (uac) => {
          uacFinalized = true;
        }
      })
        .then(({uas, uac}) => {
          if (!uacFinalized) throw new Error('cbFinalizedUac not called');
          this.emit('connected', {uas, uac});
          return;
        })
        .catch((err) => {
          throw err;
        });
    });
  }

  passHeadersOnResponse(uri, headers) {
    let uacFinalized = false;
    this.srf.invite((req, res) => {

      const subject = req.get('Subject');
      this.srf.createB2BUA(req, res, uri, {
        responseHeaders: headers,
        proxyRequestHeaders: ['Subject'],
        proxyResponseHeaders: ['Subject']
      }, {
        cbRequest: (err, uacRequest) => {
          if (uacRequest.get('Subject') !== subject) throw new Error('request header not proxied');
        },
        cbProvisional: (provisionalResponse) => {
          if (provisionalResponse.get('Subject') !== subject) throw new Error('response header not proxied');
        },
        cbFinalizedUac: (uac) => {
          uacFinalized = true;
        }
      })
        .then(({uas, uac}) => {
          if (!uacFinalized) throw new Error('cbFinalizedUac not called');
          this.emit('connected', {uas, uac});
          return;
        })
        .catch((err) => {
          throw err;
        });
    });
  }

  sdpAsPromise(uri) {

    function promiseSdp(sdpB, res) {
      return Promise.resolve(sdpB.replace(/^c=IN IP4\s(.*)$/mg, 'c=IN IP4 127.0.0.1'));
    }

    this.srf.invite((req, res) => {

      this.srf.createB2BUA(req, res, uri, {
        localSdpA: promiseSdp
      })
        .then(({uas, uac}) => {
          if (!uas.local.sdp.match(/^c=IN IP4\s(.*)$/mg)) throw new Error('failed to change sdp');
          this.emit('connected', {uas, uac});
          return;
        })
        .catch((err) => {
          throw err;
        });
    });
  }

  disconnect() {
    this.srf.disconnect();
    return this;
  }
}

module.exports = App;
