const Emitter = require('events').EventEmitter ;
const sip = require('drachtio-sip') ;
const delegate = require('delegates') ;
const assert = require('assert') ;
const noop = require('node-noop').noop;
const debug = require('debug')('drachtio-agent:request');

class Request extends Emitter {

  constructor(msg, meta) {
    super() ;

    if (msg) {
      assert(msg instanceof sip.SipMessage) ;
      this.msg = msg ;
      this.meta = meta ;
    }
  }

  get res() {
    return this._res ;
  }
  set res(res) {
    this._res = res ;
    return this ;
  }

  get isNewInvite() {
    const to = this.getParsed('to') ;
    return this.method === 'INVITE' && !('tag' in to.params) ;
  }

  get url() {
    return this.uri ;
  }

  set agent(agent) {
    this._agent = agent ;
  }
  get agent() {
    return this._agent ;
  }

  set meta(meta) {
    debug(`Request#set meta ${JSON.stringify(meta)}`);
    this.source = meta.source ;
    this.source_address = meta.address ;
    this.source_port = meta.port ? parseInt(meta.port) : 5060 ;
    this.protocol = meta.protocol ;
    this.stackTime = meta.time ;
    this.stackTxnId = meta.transactionId ;
    this.stackDialogId = meta.dialogId ;
  }

  get meta() {
    return {
      source: this.source,
      source_address: this.source_address,
      source_port: this.source_port,
      protocol: this.protocol,
      time: this.stackTime,
      transactionId: this.stackTxnId,
      dialogId: this.stackDialogId
    } ;
  }

  /**
 * Cancel a request that was sent by the application
 * @param  {Request~cancelCallback} callback - invoked with cancel operation completes
 */
  cancel(callback) {
    if (!this._agent || this.source !== 'application') {
      throw new Error('Request#cancel can only be used for uac Request') ;
    }
    this._agent.request({uri: this.uri, method: 'CANCEL', stackTxnId: this.stackTxnId}, callback) ;
  }
  /**
  * This callback is invoked when the application has sent a CANCEL for a request.
  * @callback Request~cancelCallback
  * @param {Error} err - if an error occurred while attempting to send the cancel
  * @param {Request} req - the cancel request that was sent
  */

  /**
  * Proxy an incoming request
  * @param  {Request~proxyOptions} opts - options governing the proxy operation
  * @param  {Request~proxyCallback} [callback] - callback invoked when proxy operation completes
  * @returns {Promise|Request} returns a Promise if not callback is supplied, otherwise the Request object
  */
  proxy(opts, callback) {
    if (this.source !== 'network') {
      throw new Error('Request#proxy can only be used for incoming requests') ;
    }
    opts = opts || {} ;

    //TODO: throw error if req.res.send has already been called (i.e. can't start off as UAS and then become a proxy)
    const destination = opts.destination || this.uri ;
    if (typeof destination === 'string') { opts.destination = [destination] ; }

    Object.assign(opts, {
      stackTxnId: this.stackTxnId,
      remainInDialog: opts.remainInDialog || opts.path || opts.recordRoute || false,
      provisionalTimeout: opts.provisionalTimeout || '',
      finalTimeout: opts.finalTimeout || '',
      followRedirects: opts.followRedirects || false,
      simultaneous: opts.forking === 'simultaneous',
      fullResponse: true
    }) ;

    //normalize sip uris
    opts.destination.forEach((value, index, array) => {
      const token = value.split(':') ;
      if (token[0] !== 'sip' && token[0] !== 'tel') {
        array[index] = 'sip:' + value ;
      }
    }) ;

    const result = {
      connected: false,
      responses: []
    } ;

    const __x = (callback) => {
      this._agent.proxy(this, opts, (token, rawMsg, meta) => {
        if ('NOK' === token[0]) {
          return callback(token[1]) ;
        }
        if ('done' === token[1]) {
          result.connected = (200 === result.finalStatus) ;
          return callback(null, result) ;
        }
        else {
          //add a new response to the array
          const address = meta.address ;
          const port = +meta.port;
          const msg = new sip.SipMessage(rawMsg) ;
          const obj = {
            time: meta.time,
            status: msg.status,
            msg: msg
          } ;
          let len = result.responses.length ;
          if (len === 0 || address !== result.responses[len - 1].address || port === result.responses[len - 1].port) {
            result.responses.push({
              address: address,
              port: port,
              msgs:[]
            }) ;
            len++ ;
          }
          result.responses[len - 1].msgs.push(obj) ;
          result.finalStatus = msg.status ;
          result.finalResponse = obj ;
        }
      }) ;
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
  }

  /**
  * Options governing a proxy operation
  * @typedef {Object} Request~proxyOptions
  * @property {string|Array} destination - an ordered list of one or more SIP URIs to proxy the request to
  * @property {boolean} [remainInDialog=false] - if true add a Record-Route header and emain in the SIP dialog
  * after the INVITE transaction.
  * @property {boolean} [followRedirects=false] - if true respond to 3XX redirect responses by generating
  * a new INVITE to the SIP URI in the Contact header of the response
  * @property {string} [forking=sequential] - 'simultaneous' or 'sequential'; dicates whether the proxy waits
  * for a failure response from one target before trying the next, or forks the request to all targets simultaneously
  * @property {string} [provisionalTimeout] - amount of time to wait for a 100 Trying response from a target before
  * trying the next target; valid syntax is '2s' or '1500ms' for example
  * @property {string} [finalTimeout] - amount of time to wait for a final response from a target before trying
  * the next target; syntax is as described above for provisionalTimeout
  */
  /**
  * This callback is invoked when proxy operation has completed.
  * @callback Request~proxyCallback
  * @param {Error} err - if an error occurred while attempting to proxy the request
  * @param {Request~proxyResults} results - results summarizing the proxy operation
  */

  // for compatibility with passport
  logIn(user, options, done) {
    if (typeof options === 'function') {
      done = options;
      options = {};
    }
    options = options || {};
    done = done || noop ;

    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }
    const session = (options.session === undefined) ? true : options.session;

    this[property] = user;
    if (session) {
      if (!this._passport) { throw new Error('passport.initialize() middleware not in use'); }
      if (typeof done !== 'function') { throw new Error('req#login requires a callback function'); }

      this._passport.instance.serializeUser(user, this, (err, obj) => {
        if (err) { this[property] = null; return done(err); }
        if (!this._passport.session) {
          this._passport.session = {};
        }
        this._passport.session.user = obj;
        this.session = this.session || {};
        this.session[this._passport.instance._key] = this._passport.session;
        done();
      });
    } else {
      done();
    }
  }

  // Terminate an existing login session.
  logOut() {
    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }

    this[property] = null;
    if (this._passport && this._passport.session) {
      delete this._passport.session.user;
    }
  }
  // Test if request is authenticated.
  isAuthenticated() {
    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }

    return (this[property]) ? true : false;
  }

  // Test if request is unauthenticated.
  isUnauthenticated() {
    return !this.isAuthenticated();
  }
}

module.exports = Request ;

delegate(Request.prototype, 'msg')
  .method('get')
  .method('has')
  .method('getParsedHeader')
  .method('set')
  .access('method')
  .access('uri')
  .access('headers')
  .access('body')
  .access('payload')
  .getter('type')
  .getter('raw')
  .getter('callingNumber')
  .getter('calledNumber')
  .getter('canFormDialog') ;

/**
 * response event triggered when a Request sent by the application receives a response from the network
 * @event Endpoint#destroy
 * @param {Response} res - SIP response received as a result of sending a SIP request
 */
