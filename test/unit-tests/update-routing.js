require('assert');
require('mocha');
const should = require('should');

const Emitter = require('events');
const net = require('net');
const DrachtioAgent = require('../../lib/drachtio-agent');

const CALL_ID = 'abc123@127.0.0.1';
const DIALOG_ID = `${CALL_ID};from-tag=caller-tag`;

/* an agent with one socket and one request of ours (e.g. INVITE or re-INVITE) in flight on CALL_ID */
function agentWithPendingRequest() {
  const agent = new DrachtioAgent(() => {});
  const socket = new net.Socket();
  const obj = agent._initServer(socket);
  const pending = new Emitter();
  pending.get = (hdr) => hdr.toLowerCase() === 'call-id' ? CALL_ID : undefined;
  obj.pendingSipRequests.set('txn-invite', {req: pending});
  const punted = [];
  agent.puntUpTheMiddleware = (req, res) => punted.push({req, res});
  return {agent, socket, pending, punted};
}

/* a session refresh UPDATE (no SDP) from the far end, as drachtio server hands it to us */
function updateFromNetwork() {
  const sip = [
    'UPDATE sip:service@127.0.0.1:5090 SIP/2.0',
    'Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bK-1',
    'From: <sip:caller@127.0.0.1:5060>;tag=caller-tag',
    'To: <sip:service@127.0.0.1:5090>;tag=our-tag',
    `Call-ID: ${CALL_ID}`,
    'CSeq: 2 UPDATE',
    'Session-Expires: 90;refresher=uac',
    'Content-Length: 0',
    '',
    ''
  ].join('\r\n');
  const leader = `msg-1|sip|network|${sip.length}|udp|127.0.0.1|5060|00:00:00.000|txn-update|${DIALOG_ID}|`;
  return `${leader}\r\n${sip}`;
}

describe('routing an UPDATE received while one of our requests is pending', function() {
  it('leaves it to the dialog when the pending request is a re-INVITE', function() {
    const {agent, socket, pending, punted} = agentWithPendingRequest();
    let emitted = false;
    pending.emit = (event) => { if (event === 'update') emitted = true; };

    agent._onMsg(socket, updateFromNetwork());

    emitted.should.be.false();
    punted.length.should.equal(1);
    punted[0].req.method.should.equal('UPDATE');
    punted[0].req.stackDialogId.should.equal(DIALOG_ID);
  });

  it('hands it to createUAC\'s INVITE when that is listening for it', function() {
    const {agent, socket, pending, punted} = agentWithPendingRequest();
    let got;
    pending.on('update', (req) => got = req);

    agent._onMsg(socket, updateFromNetwork());

    should.exist(got);
    got.method.should.equal('UPDATE');
    punted.length.should.equal(0);
  });
});
