const should = require('should');
const sinon = require('sinon');
const DrachtioAgent = require('../../lib/drachtio-agent');
const SipMessage = require('../../lib/sip-parser/message');
const Request = require('../../lib/request');
const Response = require('../../lib/response');
const DigestClient = require('../../lib/digest-client'); // Needed for mocking
const Emitter = require('events');
const noop = require('node-noop').noop;
const CR = '\r\n';

// Helper to create a realistic SipMessage for testing
function createSipResponseMessage(status, callId = 'test-call-id', cseqMethod = 'INVITE', headers = {}) {
  let rawMsg = `SIP/2.0 ${status} Whatever${CR}`;
  rawMsg += `Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bK-server-branch${CR}`;
  rawMsg += `Call-ID: ${callId}${CR}`;
  rawMsg += `CSeq: 1 ${cseqMethod}${CR}`;
  rawMsg += `From: <sip:alice@example.com>;tag=from-tag${CR}`;
  rawMsg += `To: <sip:bob@example.com>;tag=to-tag${CR}`;
  for (const h in headers) {
    rawMsg += `${h}: ${headers[h]}${CR}`;
  }
  rawMsg += `Content-Length: 0${CR}${CR}`;
  const sipMsg = new SipMessage(rawMsg);
  sipMsg.status = status; // Manually set status
  return sipMsg;
}

function createSipRequestMessage(method, callId = 'test-call-id', uri = 'sip:test@example.com', otherHeaders = {}) {
  let rawMsg = `${method} ${uri} SIP/2.0${CR}`;
  rawMsg += `Via: SIP/2.0/UDP 127.0.0.1:5080;branch=z9hG4bK-${Math.random().toString(36).substring(7)}${CR}`;
  rawMsg += `Call-ID: ${callId}${CR}`;
  rawMsg += `CSeq: 1 ${method}${CR}`;
  rawMsg += `From: <sip:alice@example.com>;tag=from-tag${CR}`;
  rawMsg += `To: <sip:bob@example.com>;tag=to-tag${CR}`;
  for (const h in otherHeaders) {
    rawMsg += `${h}: ${otherHeaders[h]}${CR}`;
  }
  rawMsg += `Content-Length: 0${CR}${CR}`;
  return new SipMessage(rawMsg);
}


describe('DrachtioAgent', () => {
  // Assuming _onMsg, _handleSipMsg and its helpers, _handleResponseMsg, _handleCdrMsg tests are present

  describe('Request sending: _prepareSipRequestMessage, _makeRequest, request', () => {
    // Assuming these tests are present and correct from previous steps
  });

  describe('Response sending: _setupPendingResponse, sendResponse', () => {
    let agent;
    let mockSocket;
    let mockServerObj;
    let sendMessageSpy;
    let setupPendingResponseSpy;

    beforeEach(() => {
      agent = new DrachtioAgent(sinon.stub());
      mockSocket = { 
        id: 'mock-socket-resp', 
        remoteAddress: '127.0.0.1', 
        localPort: 5060, 
        remotePort: 5080,
        destroyed: false
      };
      mockServerObj = {
        pendingRequests: new Map(),
        pendingAckOrPrack: new Map(),
        pendingNetworkInvites: new Map(),
        // ... other properties if needed
      };
      agent.mapServer.set(mockSocket, mockServerObj);

      sendMessageSpy = sinon.stub(agent, 'sendMessage').returns('msgId-' + Math.random().toString(36).substring(2, 9));
      setupPendingResponseSpy = sinon.spy(agent, '_setupPendingResponse'); // Spy on the actual method

      // Common stubs for res object, customize in tests
      // Stubs for SipMessage get/has if res.msg is a real SipMessage
      // sinon.stub(SipMessage.prototype, 'get');
      // sinon.stub(SipMessage.prototype, 'has');
    });

    afterEach(() => {
      sinon.restore();
    });

    describe('_setupPendingResponse', () => {
      let mockRes;
      let msgId;
      let callbackSpy;
      let fnAckSpy;

      beforeEach(() => {
        msgId = 'testMsgId123';
        callbackSpy = sinon.spy();
        fnAckSpy = sinon.spy();
        
        // Mock res object for _setupPendingResponse
        mockRes = {
          status: 200, // Default, override as needed
          msg: new SipMessage(`SIP/2.0 200 OK${CR}Content-Length:0${CR}${CR}`), // Basic valid SipMessage
          // Mock methods on res.msg if they are called directly
          has: sinon.stub(), // res.has('RSeq')
        };
        // Ensure res.msg.has can be controlled if needed for RSeq
        sinon.stub(mockRes.msg, 'has').returns(false); // Default to no RSeq
      });

      it('Callback provided, wp.send success: should call callback and delete pending request', () => {
        agent._setupPendingResponse(mockRes, msgId, mockServerObj, callbackSpy, null);
        
        mockServerObj.pendingRequests.has(msgId).should.be.true();
        const internalCb = mockServerObj.pendingRequests.get(msgId);
        
        const token = ['OK', 'other', 'params'];
        const rawSipMsgForCb = `SIP/2.0 200 OK${CR}Content-Length:0${CR}${CR}`; // Example raw message
        const meta = { dialogId: 'dlgTest' };
        internalCb(token, rawSipMsgForCb, meta);

        mockServerObj.pendingRequests.has(msgId).should.be.false(); // Deleted
        callbackSpy.calledOnce.should.be.true();
        callbackSpy.getCall(0).args[0].should.be.null(); // No error
        callbackSpy.getCall(0).args[1].should.be.instanceOf(SipMessage);
        mockServerObj.pendingAckOrPrack.has(meta.dialogId).should.be.false();
      });

      it('fnAck provided, RSeq present, wp.send success: should set pendingAckOrPrack', () => {
        mockRes.status = 183;
        mockRes.msg.has.withArgs('RSeq').returns(true); // RSeq is present

        agent._setupPendingResponse(mockRes, msgId, mockServerObj, null, fnAckSpy);
        
        const internalCb = mockServerObj.pendingRequests.get(msgId);
        const token = ['OK'];
        const meta = { dialogId: 'reliableDlg1' };
        internalCb(token, `SIP/2.0 183 Session Progress${CR}RSeq: 123${CR}Content-Length:0${CR}${CR}`, meta);
        
        mockServerObj.pendingAckOrPrack.has(meta.dialogId).should.be.true();
        mockServerObj.pendingAckOrPrack.get(meta.dialogId).should.equal(fnAckSpy);
      });

      it('fnAck provided, 200 OK, wp.send success: should set pendingAckOrPrack', () => {
        mockRes.status = 200; // 200 OK

        agent._setupPendingResponse(mockRes, msgId, mockServerObj, null, fnAckSpy);

        const internalCb = mockServerObj.pendingRequests.get(msgId);
        const token = ['OK'];
        const meta = { dialogId: 'okDlg1' };
        internalCb(token, `SIP/2.0 200 OK${CR}Content-Length:0${CR}${CR}`, meta);

        mockServerObj.pendingAckOrPrack.has(meta.dialogId).should.be.true();
        mockServerObj.pendingAckOrPrack.get(meta.dialogId).should.equal(fnAckSpy);
      });
      
      it('Callback provided, wp.send failure: should call callback with error', () => {
        agent._setupPendingResponse(mockRes, msgId, mockServerObj, callbackSpy, null);
        
        const internalCb = mockServerObj.pendingRequests.get(msgId);
        const token = ['ERROR', 'Failed to send'];
        internalCb(token);

        mockServerObj.pendingRequests.has(msgId).should.be.false();
        callbackSpy.calledOnce.should.be.true();
        callbackSpy.getCall(0).args[0].should.be.instanceOf(Error);
        callbackSpy.getCall(0).args[0].message.should.eql('Failed to send');
        mockServerObj.pendingAckOrPrack.size.should.eql(0);
      });

      it('No callback and no fnAck: should not set pendingRequest if not needed', () => {
        // _setupPendingResponse *will* set a pending request if either callback or fnAck is provided.
        // If neither, it does nothing with pendingRequests.
        agent._setupPendingResponse(mockRes, msgId, mockServerObj, null, null);
        mockServerObj.pendingRequests.has(msgId).should.be.false();
      });
    });

    describe('sendResponse', () => {
      let mockRes;
      let opts;
      let callbackSpy;
      let fnAckSpy;
      let emitSpy;

      beforeEach(() => {
        opts = { headers: {'X-Custom-Res': 'value'} };
        callbackSpy = sinon.spy();
        fnAckSpy = sinon.spy();
        emitSpy = sinon.spy();

        mockRes = {
          socket: mockSocket,
          msg: new SipMessage(`SIP/2.0 200 OK${CR}Content-Length:0${CR}${CR}`), // Actual SipMessage
          req: { 
            stackTxnId: 'reqTxn1',
            method: 'INVITE', // Default, override in tests
          },
          statusCode: 200, // Default
          get: sinon.stub(),
          has: sinon.stub(),
          emit: emitSpy, // For 'finish' event
          finished: false
        };
        mockRes.get.withArgs('call-id').returns('defaultCallIdForSendResponse');
      });

      it('Socket connection closed (obj is null): should call callback with error', () => {
        agent.mapServer.delete(mockSocket); // Ensure socket is not in mapServer

        agent.sendResponse(mockRes, opts, callbackSpy, fnAckSpy);

        sendMessageSpy.called.should.be.false();
        callbackSpy.calledOnce.should.be.true();
        callbackSpy.getCall(0).args[0].should.be.instanceOf(Error);
        callbackSpy.getCall(0).args[0].message.should.eql('drachtio-agent:sendResponse: socket connection closed');
      });

      it('Successful send, no callback/fnAck: should call sendMessage and _setupPendingResponse', () => {
        agent.sendResponse(mockRes, opts, null, null);

        sendMessageSpy.calledOnce.should.be.true();
        const sendMessageArgs = sendMessageSpy.getCall(0).args;
        sendMessageArgs[0].should.equal(mockSocket);
        sendMessageArgs[1].should.equal(mockRes.msg);
        sendMessageArgs[2].should.deepEqual(Object.assign({stackTxnId: 'reqTxn1'}, opts));
        
        setupPendingResponseSpy.calledOnce.should.be.true();
        const setupArgs = setupPendingResponseSpy.getCall(0).args;
        setupArgs[0].should.equal(mockRes);
        setupArgs[1].should.equal(sendMessageSpy.returnValues[0]); // msgId
        setupArgs[2].should.equal(mockServerObj);
        should(setupArgs[3]).be.null(); // callback
        should(setupArgs[4]).be.null(); // fnAck
      });
      
      it('Successful send, with callback: should call _setupPendingResponse with callback', () => {
        agent.sendResponse(mockRes, opts, callbackSpy, null);
        
        setupPendingResponseSpy.calledOnce.should.be.true();
        setupPendingResponseSpy.getCall(0).args[3].should.equal(callbackSpy);
      });

      it('Response status >= 200: should eventually emit "finish" and set res.finished', (done) => {
        mockRes.statusCode = 200;
        agent.sendResponse(mockRes, opts, null, null);

        // Use setImmediate to wait for the deferred emit
        setImmediate(() => {
          mockRes.emit.calledOnceWith('finish').should.be.true();
          mockRes.finished.should.be.true();
          done();
        });
      });
      
      it('INVITE final response (>=200): clears pendingNetworkInvites', (done) => {
        mockRes.req.method = 'INVITE';
        mockRes.statusCode = 200;
        const callId = 'inviteCallIdClear';
        mockRes.get.withArgs('call-id').returns(callId);
        mockServerObj.pendingNetworkInvites.set(callId, { req: {}, res: {} });
        sinon.spy(mockServerObj.pendingNetworkInvites, 'delete');

        agent.sendResponse(mockRes, opts, null, null);
        
        setImmediate(() => { // Wait for deferred logic
          mockServerObj.pendingNetworkInvites.delete.calledOnceWith(callId).should.be.true();
          done();
        });
      });
      
      it('Non-INVITE final response: does not clear pendingNetworkInvites', (done) => {
        mockRes.req.method = 'MESSAGE';
        mockRes.statusCode = 200;
        sinon.spy(mockServerObj.pendingNetworkInvites, 'delete');

        agent.sendResponse(mockRes, opts, null, null);

        setImmediate(() => { // Wait for deferred logic
          mockServerObj.pendingNetworkInvites.delete.called.should.be.false();
          done();
        });
      });
    });
  });
});
