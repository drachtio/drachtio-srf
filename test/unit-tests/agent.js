const DrachtioAgent = require('../../lib/drachtio-agent');
const SipMessage = require('../../lib/sip-parser/message');
const Request = require('../../lib/request');
const Response = require('../../lib/response');
const WireProtocol = require('../../lib/wire-protocol'); // For mocking
const net = require('net');
const tls = require('tls');
const sinon = require('sinon'); // Assuming sinon is available
const { expect } = require('chai'); // Assuming chai is available for expect/should
const debug = require('debug'); // To potentially spy on or disable

// Disable actual debug logging during tests for cleaner output, unless specifically testing a log.
sinon.stub(debug, 'log').callsFake(() => {}); // Generic stub for all debug instances
// If specific debug instances need to be stubbed:
// const agentDebug = debug('drachtio:agent');
// sinon.stub(agentDebug, 'enabled').value(false); // Example

describe('DrachtioAgent', () => {
  let agent;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Prevent actual network connections by default for most tests
    sandbox.stub(WireProtocol.prototype, 'connect').returns();
    sandbox.stub(WireProtocol.prototype, 'listen').returns(new net.Server());
    sandbox.stub(WireProtocol.prototype, 'send').returns('some-msg-id');
    sandbox.stub(WireProtocol.prototype, 'disconnect').returns();
    sandbox.stub(WireProtocol.prototype, 'close').returns();

    agent = new DrachtioAgent();
  });

  afterEach(() => {
    sandbox.restore();
    if (agent && agent.wp) {
      // Ensure any timers or listeners on wp are cleaned up if necessary
      agent.wp.removeAllListeners();
    }
  });

  describe('Input Validation', () => {
    describe('connect(opts, callback)', () => {
      it('should throw TypeError if opts is not an object', () => {
        expect(() => agent.connect('not-an-object')).to.throw(TypeError, /opts parameter must be an object/);
        expect(() => agent.connect(null)).to.throw(TypeError, /opts parameter must be an object/);
      });

      it('should throw TypeError if opts.secret is not a non-empty string', () => {
        expect(() => agent.connect({})).to.throw(TypeError, /opts.secret is required and must be a non-empty string/);
        expect(() => agent.connect({ secret: '' })).to.throw(TypeError, /opts.secret is required and must be a non-empty string/);
        expect(() => agent.connect({ secret: 123 })).to.throw(TypeError, /opts.secret is required and must be a non-empty string/);
      });

      it('should throw TypeError if opts.tags is provided and not an array', () => {
        expect(() => agent.connect({ secret: 'foo', tags: 'not-an-array' })).to.throw(TypeError, /opts.tags must be an array if provided/);
      });

      it('should throw TypeError if opts.tags contains non-string elements', () => {
        expect(() => agent.connect({ secret: 'foo', tags: ['a', 123] })).to.throw(TypeError, /all elements in opts.tags must be strings/);
      });

      it('should throw TypeError if callback is provided and not a function', () => {
        expect(() => agent.connect({ secret: 'foo' }, 'not-a-function')).to.throw(TypeError, /callback must be a function if provided/);
      });

      it('should succeed with valid opts (secret only)', () => {
        expect(() => agent.connect({ secret: 'foo' })).to.not.throw();
      });

      it('should succeed with valid opts (secret and tags)', () => {
        expect(() => agent.connect({ secret: 'foo', tags: ['tag1', 'tag2'] })).to.not.throw();
      });

      it('should succeed with valid opts and callback', () => {
        expect(() => agent.connect({ secret: 'foo' }, () => {})).to.not.throw();
      });
    });

    // Placeholder for listen tests (similar to connect)
    describe('listen(opts, callback)', () => {
      it('should throw TypeError if opts is not an object', () => {
        expect(() => agent.listen('not-an-object')).to.throw(TypeError, /opts parameter must be an object/);
      });
      it('should throw TypeError if opts.secret is not a non-empty string', () => {
        expect(() => agent.listen({})).to.throw(TypeError, /opts.secret is required and must be a non-empty string/);
      });
      it('should succeed with valid opts', () => {
        expect(() => agent.listen({ secret: 'foo' })).to.not.throw();
      });
      it('should throw TypeError if opts.tags is provided and not an array for listen', () => {
        expect(() => agent.listen({ secret: 'foo', tags: 'not-an-array' })).to.throw(TypeError, /opts.tags must be an array if provided/);
      });
      it('should throw TypeError if opts.tags contains non-string elements for listen', () => {
        expect(() => agent.listen({ secret: 'foo', tags: ['a', 123] })).to.throw(TypeError, /all elements in opts.tags must be strings/);
      });
      it('should throw TypeError if callback is provided and not a function for listen', () => {
        expect(() => agent.listen({ secret: 'foo' }, 'not-a-function')).to.throw(TypeError, /callback must be a function if provided/);
      });
    });
    
    describe('request(uri, options, callback) / _normalizeParams', () => {
      it('should throw TypeError if options._socket is provided and not a valid socket', (done) => {
        try {
          // Need to ensure _normalizeParams is called. agent.request directly calls it.
          // We need a case where options._socket is evaluated.
          // This happens if the first arg is not a socket, and options._socket is present.
          agent.request('sip:test', { method: 'INVITE', _socket: {} }, () => {});
        } catch (e) {
          expect(e).to.be.instanceOf(TypeError);
          expect(e.message).to.match(/options._socket must be a valid socket object/);
          done();
        }
      });

      it('should throw TypeError if options.uri is missing or invalid after normalization', (done) => {
        try {
          agent.request({ method: 'INVITE' }, () => {}); // Missing uri
        } catch (e) {
          expect(e).to.be.instanceOf(TypeError);
          expect(e.message).to.match(/options.uri is required/);
          done();
        }
      });
      
      it('should throw TypeError if options.method is missing or invalid after normalization', (done) => {
        try {
          agent.request({ uri: 'sip:test@example.com'}, () => {}); // Missing method
        } catch (e) {
          expect(e).to.be.instanceOf(TypeError);
          expect(e.message).to.match(/options.method is required/);
          done();
        }
      });

       it('should throw TypeError if callback is provided but not a function after normalization', (done) => {
        try {
          // agent.request('sip:test@example.com', { method: 'INVITE'}, "not-a-function");
          // This structure means options is {method: 'INVITE'} and callback is "not-a-function"
           agent.request('sip:test@example.com', { method: 'INVITE'}, "invalid");
        } catch (e) {
          expect(e).to.be.instanceOf(TypeError);
          expect(e.message).to.match(/callback, if provided, must be a function/);
          done();
        }
      });
    });

    describe('sendResponse(res, opts, callback, fnAck)', () => {
      let mockRes;
      beforeEach(() => {
        mockRes = new Response(); // Assuming Response constructor is simple
        mockRes.socket = new net.Socket(); // Needs a socket
        mockRes.req = { stackTxnId: 'test-txn' }; // for opts assignment
        mockRes.msg = new SipMessage('SIP/2.0 200 OK\r\n\r\n');
      });

      it('should throw TypeError if res is not an instance of Response', () => {
        expect(() => agent.sendResponse({}, {})).to.throw(TypeError, /res parameter must be an instance of Response/);
      });
      it('should throw TypeError if opts is provided and not an object', () => {
        expect(() => agent.sendResponse(mockRes, 'not-an-object')).to.throw(TypeError, /opts parameter must be an object if provided/);
      });
      it('should throw TypeError if callback is provided and not a function', () => {
        expect(() => agent.sendResponse(mockRes, {}, 'not-a-function')).to.throw(TypeError, /callback must be a function if provided/);
      });
      it('should throw TypeError if fnAck is provided and not a function', () => {
        expect(() => agent.sendResponse(mockRes, {}, () => {}, 'not-a-function')).to.throw(TypeError, /fnAck must be a function if provided/);
      });
      it('should succeed with valid parameters', () => {
        expect(() => agent.sendResponse(mockRes, {})).to.not.throw();
      });
    });

    describe('sendAck(method, dialogId, req, res, opts, callback)', () => {
      let mockReq, mockRes;
      beforeEach(() => {
        mockReq = new Request(new SipMessage('INVITE sip:test@example.com SIP/2.0\r\n\r\n'));
        mockRes = new Response();
        mockRes.socket = new net.Socket();
      });

      it('should throw TypeError if method is not a non-empty string', () => {
        expect(() => agent.sendAck('', 'dlg', mockReq, mockRes)).to.throw(TypeError, /method is required/);
      });
      it('should throw TypeError if dialogId is not a non-empty string', () => {
        expect(() => agent.sendAck('ACK', '', mockReq, mockRes)).to.throw(TypeError, /dialogId is required/);
      });
      it('should throw TypeError if req is not an instance of Request', () => {
        expect(() => agent.sendAck('ACK', 'dlg', {}, mockRes)).to.throw(TypeError, /req parameter must be an instance of Request/);
      });
      it('should throw TypeError if res is not an instance of Response', () => {
        expect(() => agent.sendAck('ACK', 'dlg', mockReq, {})).to.throw(TypeError, /res parameter must be an instance of Response/);
      });
       it('should throw Error if res.socket is missing', () => {
        delete mockRes.socket; // Intentionally remove socket
        expect(() => agent.sendAck('ACK', 'dlg', mockReq, mockRes)).to.throw(Error, /res.socket is missing/);
      });
      it('should succeed with valid parameters', () => {
         expect(() => agent.sendAck('ACK', 'dlg', mockReq, mockRes)).to.not.throw();
      });
    });

    describe('proxy(req, opts, callback)', () => {
      let mockReq;
      beforeEach(() => {
        mockReq = new Request(new SipMessage('INVITE sip:test@example.com SIP/2.0\r\n\r\n'));
        mockReq.socket = new net.Socket();
        mockReq.get = sandbox.stub().returns('call-id'); // For pendingNetworkInvites.delete
      });

      it('should throw TypeError if req is not an instance of Request', () => {
        expect(() => agent.proxy({}, { destination: ['sip:bob@example.com'] })).to.throw(TypeError, /req parameter must be an instance of Request/);
      });
      it('should throw TypeError if opts is not an object', () => {
        expect(() => agent.proxy(mockReq, 'not-an-object')).to.throw(TypeError, /opts parameter must be an object/);
      });
      it('should throw TypeError if opts.destination is not a non-empty array', () => {
        expect(() => agent.proxy(mockReq, {})).to.throw(TypeError, /opts.destination is required and must be a non-empty array/);
        expect(() => agent.proxy(mockReq, { destination: [] })).to.throw(TypeError, /opts.destination is required and must be a non-empty array/);
      });
      it('should throw TypeError if opts.destination contains non-strings', () => {
        expect(() => agent.proxy(mockReq, { destination: [123] })).to.throw(TypeError, /all elements in opts.destination must be non-empty strings/);
      });
      it('should throw Error if req.socket is missing', () => {
        delete mockReq.socket;
        expect(() => agent.proxy(mockReq, { destination: ['sip:bob@example.com'] })).to.throw(Error, /req.socket is missing/);
      });
      it('should succeed with valid parameters', () => {
        expect(() => agent.proxy(mockReq, { destination: ['sip:bob@example.com'] })).to.not.throw();
      });
    });

    describe('set(prop, val)', () => {
      it('should throw TypeError if prop is not a non-empty string', () => {
        expect(() => agent.set('', 'val')).to.throw(TypeError, /prop is required/);
      });
      it('should throw TypeError if val is undefined', () => {
        expect(() => agent.set('prop', undefined)).to.throw(TypeError, /val is required/);
      });
      it('should throw TypeError if prop is "handler" and val is not a function', () => {
        expect(() => agent.set('handler', 'not-a-function')).to.throw(TypeError, /handler value must be a function/);
      });
      it('should succeed with valid "handler"', () => {
        expect(() => agent.set('handler', () => {})).to.not.throw();
      });
      it('should succeed with other valid prop/val', () => {
        expect(() => agent.set('customProp', 123)).to.not.throw();
        expect(agent.get('customProp')).to.equal(123);
      });
    });

    describe('route(verb)', () => {
      it('should throw TypeError if verb is not a non-empty string', () => {
        expect(() => agent.route('')).to.throw(TypeError, /verb is required/);
      });
      it('should throw Error for duplicate route', () => {
        agent.route('INVITE');
        expect(() => agent.route('INVITE')).to.throw(Error, /duplicate route request for INVITE/);
      });
      it('should succeed with valid verb', () => {
        expect(() => agent.route('INVITE')).to.not.throw();
      });
    });

    describe('removeRoute(verb)', () => {
      it('should throw TypeError if verb is not a non-empty string', () => {
        expect(() => agent.removeRoute('')).to.throw(TypeError, /verb is required/);
      });
      it('should throw Error if route does not exist', () => {
        expect(() => agent.removeRoute('INVITE')).to.throw(Error, /no route request to remove for INVITE/);
      });
      it('should succeed if route exists', () => {
        agent.route('INVITE'); // Needs a connected socket for actual send
        // Simulate a connected and authenticated socket for routeVerbs to proceed
        const mockSocket = new net.Socket();
        agent.mapServer.set(mockSocket, { authenticated: true, pendingRequests: new Map() });
        agent.routeVerbs(mockSocket); // To mark verb as sent
        
        expect(() => agent.removeRoute('INVITE')).to.not.throw();
      });
    });

    describe('disconnect(socket)', () => {
      it('should throw TypeError if provided socket is not a valid socket object', () => {
        expect(() => agent.disconnect({})).to.throw(TypeError, /Provided socket is not a valid net.Socket or tls.TLSSocket object/);
      });
      it('should succeed if no socket is provided (disconnect all/default)', () => {
        expect(() => agent.disconnect()).to.not.throw();
      });
      it('should succeed if a valid socket is provided', () => {
        const mockSocket = new net.Socket();
        // Simulate it being a known socket
        agent._initServer(mockSocket); // To add to mapServer
        expect(() => agent.disconnect(mockSocket)).to.not.throw();
      });
    });
  });

  describe('Error Handling', () => {
    let mockSocket;

    beforeEach(() => {
      // A basic mock socket for _onMsg tests
      mockSocket = new net.Socket(); 
      // Simulate a server connection on the agent for some tests
      agent._initServer(mockSocket); 
      // Stub the real wp.send, which might be called by some error handling paths
      // (already stubbed in main beforeEach, but ensure it's here for clarity)
      sandbox.stub(agent.wp, 'send');
    });

    it('should emit "connect" and "error" on authentication failure', (done) => {
      const expectedError = new Error('failed to authenticate to server');
      let connectError = null;
      let generalError = null;

      agent.on('connect', (err) => {
        connectError = err;
      });
      agent.on('error', (err) => {
        generalError = err;
        // End the test in the 'error' event handler as it might be emitted after 'connect'
        expect(connectError).to.be.instanceOf(Error);
        expect(connectError.message).to.equal(expectedError.message);
        expect(generalError).to.be.instanceOf(Error);
        expect(generalError.message).to.equal(expectedError.message);
        done();
      });
      
      // Simulate connection and the wp.send for authenticate being called
      agent.wp.emit('connect', mockSocket); // Triggers _onConnect

      // Find the callback for the authenticate message
      const authMsgId = agent.wp.send.args.find(arg => arg[1].startsWith('authenticate'))[0]; // Get msgId from send stub
      const pendingAuth = agent.mapServer.get(mockSocket).pendingRequests.get(authMsgId);
      
      expect(pendingAuth).to.be.a('function');
      // Simulate server responding with auth failure
      pendingAuth(['FAIL', 'failed to authenticate to server']);
    });

    it('should emit "error" on unhandled server command error', (done) => {
      agent.on('error', (err) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.match(/Server command nonExistentRid failed: AUTH_FAILURE/);
        done();
      });

      const rawServerResponse = 'response|nonExistentRid|FAIL|AUTH_FAILURE\r\n';
      agent._onMsg(mockSocket, rawServerResponse);
    });

    it('should call _makeRequest callback with an Error on server failure response', (done) => {
      const requestOptions = { method: 'INVITE', uri: 'sip:test@example.com', headers: {} };
      
      agent.request(requestOptions, (err, req) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.match(/request command failed with status FAIL_REQ/);
        expect(req).to.be.undefined;
        done();
      });

      // _makeRequest would have called wp.send, get that msgId from the stub
      const makeRequestMsgId = agent.wp.send.lastCall.args[0];
      const serverHandlerCallback = agent.mapServer.get(mockSocket).pendingRequests.get(makeRequestMsgId);
      expect(serverHandlerCallback).to.be.a('function');

      // Simulate server responding with failure to the 'sip' command from _makeRequest
      // Format: [status, type_if_ok_else_err_reason, ...]
      const errorResponsePayloadTokens = ['FAIL_REQ', 'Failed to process SIP message'];
      serverHandlerCallback(errorResponsePayloadTokens, ''); // No SIP body for this failure simulation
    });

    it('should emit "error" on invalid incoming SIP message', (done) => {
      agent.on('error', (err) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.match(/Error parsing incoming SIP message/);
        done();
      });
      // msgType is token[1]
      const invalidSipPayload = 'sip|network|tcp|1.2.3.4|5060|invalid-sip-message-body';
      agent._onMsg(mockSocket, `${invalidSipPayload}\r\nThis is not valid SIP.`);
    });
    
    it('should emit "error" on invalid incoming CDR message', (done) => {
      agent.on('error', (err) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.match(/Error parsing CDR SIP message/);
        done();
      });
      const invalidCdrPayload = 'cdr:start|network|time|duration|invalid-cdr-sip-body';
      agent._onMsg(mockSocket, `${invalidCdrPayload}\r\nThis is not valid SIP for CDR.`);
    });

    it('should call _makeRequest callback with an Error if initial SipMessage construction fails', (done) => {
      const invalidOptions = { method: 'INVALID METHOD', uri: 'sip:test@example.com' }; // Invalid method token
      agent.request(invalidOptions, (err, req) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.include('Error constructing SipMessage for request');
        expect(req).to.be.undefined;
        // Also check for the agent-level error emission
        const errorSpy = sandbox.spy();
        agent.once('error', errorSpy);
        // Need a short delay to allow the event to emit if it's asynchronous from the throw
        setTimeout(() => {
          expect(errorSpy.calledOnce).to.be.true;
          expect(errorSpy.firstCall.args[0].message).to.include('Error constructing SipMessage for request');
          done();
        }, 10);
      });
    });
    
    it('should call _makeRequest callback with an Error if Request construction from response fails', (done) => {
      const requestOptions = { method: 'INVITE', uri: 'sip:test@example.com' };
      // Stub actual SipMessage constructor to throw only on specific input
      const originalSipMessage = SipMessage;
      const erroringSipMessage = function(text) {
        if (text === 'INVALID_SIP_RESPONSE_BODY_FOR_REQUEST') {
          throw new Error('Simulated SipMessage failure on response body');
        }
        return new originalSipMessage(text);
      };
      // Temporarily replace global/module SipMessage if Request internally uses it via require
      // This is a bit tricky; ideally SipMessage would be injectable or Request would allow passing a parser.
      // For now, we assume Request uses the same SipMessage.
      // If this doesn't work, we'd need to stub SipMessage.prototype methods used by Request.
      // sandbox.stub(SipMessage, 'constructor').callsFake(erroringSipMessage); // This doesn't work for constructor
      // Instead, we'll rely on the fact that `new SipMessage()` will be called, and we can stub its internal parsing
      // For this test, let's assume the SipMessage constructor itself will throw.
      // We will achieve this by providing a body that SipMessage cannot parse.

      agent.request(requestOptions, (err, req) => {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.include('Error constructing Request from SipMessage');
        expect(req).to.be.undefined;
        done();
      });

      const makeRequestMsgId = agent.wp.send.lastCall.args[0];
      const serverHandlerCallback = agent.mapServer.get(mockSocket).pendingRequests.get(makeRequestMsgId);
      const okResponsePayloadTokens = ['OK', 'sip', 'network', 'udp', '1.2.3.4', '5060', 'time', 'txnid', 'dlgid'];
      // This malformed body should cause `new SipMessage("MALFORMED")` to throw inside the callback in _makeRequest
      serverHandlerCallback(okResponsePayloadTokens, 'MALFORMED SIP BODY\r\nThis will fail parsing\r\n'); 
    });

    it('should emit "error" if new Response() fails in _handleNetworkSipResponse', (done) => {
      agent.request({ method: 'INVITE', uri: 'sip:test@example.com' }, () => {}); // Setup a pending request
      const clientRequestTxnId = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value;

      const responseError = new Error('Response constructor failed');
      const oldResponse = Response; // Keep original
      global.Response = sandbox.stub().throws(responseError); // Stub global Response

      agent.on('error', (err) => {
        expect(err.message).to.include(`Error constructing Response for network SIP response: ${responseError.message}`);
        global.Response = oldResponse; // Restore
        done();
      });

      const okMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequestTxnId}|dlg1\r\n` +
        'SIP/2.0 200 OK\r\nCSeq: 1 INVITE\r\n\r\n';
      agent._onMsg(mockSocket, okMsg);
    });

    it('should emit "error" and original response if new DigestClient() fails in _handleDigestAuthentication', (done) => {
      agent.request({ method: 'INVITE', uri: 'sip:test@example.com', auth: { user: 'u', pass: 'p'} }, (err, req) => {
        // This callback is for the original request, it should eventually get the 401/407
        expect(err).to.be.null; // Initial request sending is fine
        if (req) { // This is the UAC request object
         req.on('response', (res) => { // Response to the UAC request
            expect(res.status).to.equal(401); // The original 401 should be emitted
            done();
          });
        }
      });
      const clientRequestTxnId = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value;

      const digestError = new Error('DigestClient constructor failed');
      const oldDigestClient = global.DigestClient;
      global.DigestClient = sandbox.stub().throws(digestError);

      agent.on('error', (err) => { // Agent level error for the construction failure
        expect(err.message).to.include(`Error constructing DigestClient: ${digestError.message}`);
        global.DigestClient = oldDigestClient; // Restore
      });
      
      const challengeMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequestTxnId}|dlg1\r\n` +
        'SIP/2.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="test", nonce="abc"\r\nCall-ID: authcall-digest-fail\r\nCSeq: 1 INVITE\r\n\r\n';
      agent._onMsg(mockSocket, challengeMsg);
    });

    it('should emit "error" and original response if client.authenticate calls back with error', (done) => {
      let originalRequestObj;
      agent.request({ method: 'INVITE', uri: 'sip:test@example.com', auth: { user: 'u', pass: 'p'} }, (err, req) => {
        originalRequestObj = req;
        if (originalRequestObj) {
          originalRequestObj.on('response', (res) => {
            expect(res.status).to.equal(401); // Original 401 should be emitted
            done();
          });
        }
      });
      const clientRequestTxnId = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value;
      
      const authCallbackError = new Error('Authentication callback failed');
      sandbox.stub(DigestClient.prototype, 'authenticate').callsFake(function(callback) {
        callback(authCallbackError); // Simulate error from authenticate
      });

      agent.on('error', (err) => {
        expect(err.message).to.include(authCallbackError.message);
      });

      const challengeMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequestTxnId}|dlg1\r\n` +
      'SIP/2.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="test", nonce="abc"\r\nCall-ID: authcall-cb-fail\r\nCSeq: 1 INVITE\r\n\r\n';
      agent._onMsg(mockSocket, challengeMsg);
    });
    
    it('should emit original response if client.authenticate calls back with (null, null)', (done) => {
      let originalRequestObj;
      agent.request({ method: 'INVITE', uri: 'sip:test@example.com', auth: { user: 'u', pass: 'p'} }, (err, req) => {
        originalRequestObj = req;
        if (originalRequestObj) {
          originalRequestObj.on('response', (res) => {
            expect(res.status).to.equal(401); // Original 401 should be emitted
            done();
          });
        }
      });
      const clientRequestTxnId = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value;
      
      sandbox.stub(DigestClient.prototype, 'authenticate').callsFake(function(callback) {
        callback(null, null); // Simulate (null, null) from authenticate
      });

      const challengeMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequestTxnId}|dlg1\r\n` +
      'SIP/2.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="test", nonce="abc"\r\nCall-ID: authcall-null-null\r\nCSeq: 1 INVITE\r\n\r\n';
      agent._onMsg(mockSocket, challengeMsg);
    });

  });

  describe('Refactored Logic (_onMsg helpers)', () => {
    let mockSocket;
    let serverObjState; // To access pendingNetworkInvites etc.

    beforeEach(() => {
      mockSocket = new net.Socket();
      agent._initServer(mockSocket);
      serverObjState = agent.mapServer.get(mockSocket);
      sandbox.spy(agent, 'puntUpTheMiddleware');
      sandbox.spy(SipMessage.prototype, 'get'); // To check for 'call-id'
    });

    describe('_handleNetworkSipRequest', () => {
      it('should handle INVITE, call puntUpTheMiddleware, and add to pendingNetworkInvites', () => {
        const inviteMsg = 'sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|tx1|dlg1\r\n' +
          'INVITE sip:bob@example.com SIP/2.0\r\n' +
          'Via: SIP/2.0/UDP client.example.com;branch=z9hG4bK776asdhds\r\n' +
          'Call-ID: call123\r\n' +
          'CSeq: 1 INVITE\r\n\r\n';
        agent._onMsg(mockSocket, inviteMsg);

        expect(agent.puntUpTheMiddleware.calledOnce).to.be.true;
        const [req, res] = agent.puntUpTheMiddleware.firstCall.args;
        expect(req).to.be.instanceOf(Request);
        expect(res).to.be.instanceOf(Response);
        expect(req.method).to.equal('INVITE');
        expect(serverObjState.pendingNetworkInvites.has('call123')).to.be.true;
      });

      it('should handle CANCEL for an existing INVITE, emit "cancel" on original request', () => {
        // First, send an INVITE
        const inviteMsg = 'sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|tx1|dlg1\r\n' +
          'INVITE sip:bob@example.com SIP/2.0\r\n' +
          'Call-ID: cancel_call123\r\nCSeq: 1 INVITE\r\n\r\n';
        agent._onMsg(mockSocket, inviteMsg);
        
        const originalInviteReq = serverObjState.pendingNetworkInvites.get('cancel_call123').req;
        const cancelSpy = sandbox.spy();
        originalInviteReq.on('cancel', cancelSpy);

        // Then, send CANCEL
        const cancelMsg = 'sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12346|tx2|dlg1\r\n' +
          'CANCEL sip:bob@example.com SIP/2.0\r\n' +
          'Call-ID: cancel_call123\r\nCSeq: 1 CANCEL\r\n\r\n';
        agent._onMsg(mockSocket, cancelMsg);

        expect(cancelSpy.calledOnce).to.be.true;
        expect(serverObjState.pendingNetworkInvites.has('cancel_call123')).to.be.false;
      });
    });

    describe('_handleNetworkSipResponse', () => {
      it('should process a 200 OK for a pending request and emit "response"', (done) => {
        const opts = { method: 'INVITE', uri: 'sip:test@example.com' };
        let originalReq;
        agent.request(opts, (err, req) => { /* main callback for agent.request */ originalReq = req; });
        
        const clientRequest = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value; // Get transactionId
        expect(clientRequest).to.exist;
        const sr = agent.mapServer.get(mockSocket).pendingSipRequests.get(clientRequest);
        sr.req.on('response', (res, ackFn) => {
          expect(res.status).to.equal(200);
          expect(res.req).to.equal(sr.req); // Ensure response is linked to original req
          expect(ackFn).to.be.a('function'); // For INVITE, ackFn should be bound
          done();
        });

        const okMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequest}|dlg1\r\n` +
          'SIP/2.0 200 OK\r\nCall-ID: somecallid\r\nCSeq: 1 INVITE\r\n\r\n';
        agent._onMsg(mockSocket, okMsg);
      });

      it('should trigger digest authentication for 401/407 if auth options provided', () => {
        const authOpts = { 
          method: 'INVITE', 
          uri: 'sip:test@example.com',
          auth: { username: 'user', password: 'password' }
        };
        agent.request(authOpts, () => {}); // Callback for agent.request

        const clientRequestTxnId = agent.mapServer.get(mockSocket).pendingSipRequests.keys().next().value;
        const sr = agent.mapServer.get(mockSocket).pendingSipRequests.get(clientRequestTxnId);
        
        const digestClientStub = sandbox.stub(DigestClient.prototype, 'authenticate').callsFake(function(callback) {
          // Simulate successful authentication, providing a new "authenticated" request object
          const newSipMsg = new SipMessage('INVITE sip:test@example.com SIP/2.0\r\nAuthorization: Digest ...\r\n\r\n');
          const newReq = new Request(newSipMsg, {});
          newReq.stackTxnId = 'newTxnForAuth'; // Simulate new transaction ID
          callback(null, newReq); 
        });
        const authenticateEventSpy = sandbox.spy();
        sr.req.on('authenticate', authenticateEventSpy);
        
        // Simulate 401 response
        const challengeMsg = `sip|network|127.0.0.1:5060|udp|127.0.0.1|5060|12345|${clientRequestTxnId}|dlg1\r\n` +
          'SIP/2.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="test", nonce="abc"\r\nCall-ID: authcall\r\nCSeq: 1 INVITE\r\n\r\n';
        agent._onMsg(mockSocket, challengeMsg);

        expect(digestClientStub.calledOnce).to.be.true;
        expect(authenticateEventSpy.calledOnce).to.be.true; // 'authenticate' event on original req
        // Check if _makeRequest was called again (which means wp.send would be called for the new auth'd request)
        // The lastCall to wp.send was for the original request. The one before last should be the auth'd one.
        expect(agent.wp.send.lastCall.args[1]).to.include('Authorization: Digest');
      });
    });
    
    describe('_handleAppSipUnsolicitedRequest', () => {
      it('should handle unsolicited BYE from application and call puntUpTheMiddleware', () => {
        const byeMsg = 'sip|application|127.0.0.1:5060|udp|127.0.0.1|5060|12345|unsolicited|dlg1\r\n' +
          'BYE sip:bob@client.example.com SIP/2.0\r\n' +
          'Call-ID: unsolicited_call\r\nCSeq: 2 BYE\r\n\r\n';
        agent._onMsg(mockSocket, byeMsg);

        expect(agent.puntUpTheMiddleware.calledOnce).to.be.true;
        const [req, res] = agent.puntUpTheMiddleware.firstCall.args;
        expect(req.method).to.equal('BYE');
        expect(typeof res.send).to.equal('function'); // res.send should be a noop
        res.send(); // Call it to ensure no error
      });
    });

    describe('_handleCdrMsg', () => {
      it('should parse CDR message and invoke registered handler', (done) => {
        const cdrHandlerSpy = sandbox.spy((source, time, durationOrSipMsg, sipMsgIfAttempt) => {
          expect(source).to.equal('network');
          expect(time).to.be.a('string');
          expect(durationOrSipMsg).to.equal('120'); // duration for start/stop
          expect(sipMsgIfAttempt).to.be.instanceOf(SipMessage);
          expect(sipMsgIfAttempt.method).to.equal('INVITE');
          done();
        });
        agent.on('cdr:start', cdrHandlerSpy);

        const cdrStartMsg = 'cdr:start|network|2023-01-01T12:00:00Z|120\r\n' + 
          'INVITE sip:bob@example.com SIP/2.0\r\nCall-ID: cdr_call\r\nCSeq: 1 INVITE\r\n\r\n';
        agent._onMsg(mockSocket, cdrStartMsg);
        
        expect(cdrHandlerSpy.calledOnce).to.be.true;
      });
    });
  });
});

// Helper to create a simple mock socket if needed elsewhere
// function createMockSocket() { // Already defined above, ensure it's used or remove if not needed globally
//   const socket = new net.Socket();
//   return socket;
// }
