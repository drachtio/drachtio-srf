require('assert');
require('mocha');
const should = require('should');

const Emitter = require('events');
const net = require('net');
const Srf = require('../../lib/srf');
const DrachtioAgent = require('../../lib/drachtio-agent');

/* an agent with one socket that has an INVITE in flight */
function agentWithPendingRequest() {
  const agent = new DrachtioAgent(() => {});
  const socket = new net.Socket();
  const req = new Emitter();
  agent.mapServer.set(socket, {pendingSipRequests: new Map([['txn-1', {req}]])});
  return {agent, socket, req};
}

describe('connection to drachtio server lost', function() {
  it('fails pending requests when the socket closes', function() {
    const {agent, socket, req} = agentWithPendingRequest();
    let err;
    req.on('connection-lost', (e) => err = e);

    agent._onClose(socket);

    should.exist(err);
    err.code.should.equal('ECONNLOST');
    agent.mapServer.has(socket).should.be.false();
  });

  it('fails pending requests when the app disconnects a specific socket', function() {
    const {agent, socket, req} = agentWithPendingRequest();
    agent.wp = {disconnect: () => {}};
    let err;
    req.on('connection-lost', (e) => err = e);

    agent.disconnect(socket);

    should.exist(err);
    err.code.should.equal('ECONNLOST');
    agent.mapServer.has(socket).should.be.false();
  });

  it('rejects an in-flight createUAC', async function() {
    const srf = new Srf();
    const req = new Emitter();
    srf._app.request = (_opts, callback) => callback(null, req);

    const uac = srf.createUAC('sip:b@example.com', {localSdp: 'v=0'});
    setImmediate(() => {
      const err = new Error('connection to drachtio server lost');
      err.code = 'ECONNLOST';
      req.emit('connection-lost', err);
    });

    const err = await uac.then(() => null, (e) => e);
    should.exist(err);
    err.code.should.equal('ECONNLOST');
  });
});
