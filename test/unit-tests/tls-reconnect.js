require('should');
const net = require('net');
const WireProtocol = require('../../lib/wire-protocol');

/* A plain TCP server that records the first byte of every connection and drops the
   first one. A TLS client opens with a handshake record (0x16); a plain TCP client
   sends nothing until the application writes. No certificate is needed: the test
   only checks which kind of socket the client opened. */
function listen() {
  const firstBytes = [];
  let waiter;
  const server = net.createServer((socket) => {
    const index = firstBytes.length;
    firstBytes.push(null);
    socket.on('error', () => {});
    socket.once('data', (data) => {
      firstBytes[index] = data[0];
      if (index === 0) socket.destroy();
      if (waiter) waiter();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server,
    port: server.address().port,
    firstBytes,
    onData: (fn) => waiter = fn,
  })));
}

describe('wire-protocol reconnect over TLS', function() {
  this.timeout(5000);
  let server;
  let wp;

  afterEach(async function() {
    if (wp) {
      wp.closing = true;
      if (wp.reconnectVars.retryTimer) clearTimeout(wp.reconnectVars.retryTimer);
      if (wp.socket) wp.socket.destroy();
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    wp = server = null;
  });

  it('reconnects with TLS when the first connection was TLS', async function() {
    const mock = await listen();
    server = mock.server;
    wp = new WireProtocol({});
    wp.on('error', () => {});

    const second = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        `reconnect sent no TLS handshake; first bytes seen: ${JSON.stringify(mock.firstBytes)}`)), 3000);
      mock.onData(() => {
        if (mock.firstBytes.length >= 2 && mock.firstBytes[1] !== null) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    wp.connect({host: '127.0.0.1', port: mock.port, tls: {rejectUnauthorized: false}});
    await second;

    mock.firstBytes[0].should.equal(0x16);
    mock.firstBytes[1].should.equal(0x16);
  });
});
