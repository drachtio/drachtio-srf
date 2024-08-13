
require('should');
const wp = require('../../lib/wire-protocol');
const net = require('net');

class mockdrachtio{
  constructor() {
    this.server = null;
  }

  static create() {
    return new mockdrachtio();
  }

  async listen(ondata) {
    this.server = net.createServer((socket) => {
      if(this.socket) throw new Error("socket already set");

      this.socket = socket;
      this.socket.on('error', (err) => {
        console.log("socket error", err);
      });
      if(this._clientwait) this._clientwait();
      socket.on('data', (data) => {
        if(!ondata) return;
        ondata(data);
      });
    });

    await new Promise( resolve => {
      this.server.listen(27017, () => {
        resolve(this.server);
      } )
    })
  }

  async waitforclient() {
    await new Promise(resolve=>this._clientwait = resolve);
  }

  async close(s) {
    if(this.socket){
      await new Promise(resolve=>{
        this.socket.end(()=>{
          resolve();
        })
      });
    }
    if(this.server) {
      await new Promise(resolve=>{
        this.server.close(()=>{
          resolve();
        })
      })
    }
  }

  /**
   * 
   * @param {Buffer} data 
   */
  write(data) {
    const fullbuffer = Buffer.concat([Buffer.from(""+data.length), Buffer.from('#'), data]);
    this.socket.write(fullbuffer);
  }

  /**
   * 
   * @param {Array<Buffer>} data 
   */
  writemultiple(data) {
    let fullbuffer = Buffer.concat([]);
    data.forEach( d => {
      fullbuffer = Buffer.concat([fullbuffer,Buffer.from(""+d.length), Buffer.from('#'), d]);
    });
    this.socket.write(fullbuffer);
  }
}

describe('wire-protocol', function () {

  let ourmockdrachtio;
  let ourwp;
  let wpsocket;

  afterEach( async function() {
    if(wpsocket) ourwp.disconnect(wpsocket);
    wpsocket=null;
    wpobj=null;

    if( ourmockdrachtio ) await ourmockdrachtio.close();
    ourmockdrachtio=null;
  });

  it('simple single message', async function () {

    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);
      enough()
    });

    ourmockdrachtio.writemultiple([Buffer.from('hello')])
    await completemessages;

    recevedmsgs[0].should.equal("hello");
  });
  it('simple single message with utf8', async function () {

    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);
      enough()
    });

    ourmockdrachtio.writemultiple([Buffer.from('👨‍👩‍👧‍👦hello👨‍👩‍👧‍👦')])
    await completemessages;

    recevedmsgs[0].should.equal("👨‍👩‍👧‍👦hello👨‍👩‍👧‍👦");
  });
  it('multiple repeating message with utf8', async function () {

    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);

      if(recevedmsgs.length>=1000)
        enough()
    });

    let buf=[]
    for(let i=0;i<1000;i++){
      buf.push(Buffer.from('👨‍👩‍👧‍👦hello👨‍👩‍👧‍👦'));
    }

    ourmockdrachtio.writemultiple(buf);
    await completemessages;

    recevedmsgs[0].should.equal("👨‍👩‍👧‍👦hello👨‍👩‍👧‍👦");
  });
  it('multiple repeating message with large message single buffer', async function () {

    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    const nummessages = 200;
    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);

      if(recevedmsgs.length>=nummessages)
        enough()
    });

    let buf=[]
    for(let i=0;i<nummessages;i++){
      buf.push(Buffer.alloc(10000, 'a'));
    }

    ourmockdrachtio.writemultiple(buf);
    await completemessages;

    recevedmsgs[0].should.equal(buf[0].toString('utf-8'));
  }).timeout(70000);
  it('multiple repeating message with large message multiple writes', async function () {
    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    const nummessages = 1000;
    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);

      if(recevedmsgs.length>=nummessages)
        enough()
    });

    for(let i=0;i<nummessages;i++){
      ourmockdrachtio.write(Buffer.alloc(10000, 'a'));
    }

    await completemessages;

    recevedmsgs[0].should.equal(Buffer.alloc(10000, 'a').toString('utf-8'));
  }).timeout(70000);
  it('loads of # to ensure we find the right one', async function () {
    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    const nummessages = 100;
    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);

      if(recevedmsgs.length>=nummessages)
        enough()
    });

    for(let i=0;i<nummessages;i++){
      ourmockdrachtio.write(Buffer.alloc(10000, '#'));
    }

    await completemessages;

    for(let i=0;i<nummessages;i++){
      recevedmsgs[i].should.equal(Buffer.alloc(10000, '#').toString('utf-8'));
    }
  });
  it('invalid message contents', async function () {
    const validpart = Buffer.from('Hello, this is valid UTF-8 text. ', 'utf8');
    const invalidpart = Buffer.from([0xC3, 0x28, 0xA0, 0xFF]);

    
    const mixedbuffer = Buffer.concat([validpart, invalidpart]);

    ourmockdrachtio = mockdrachtio.create();
    await ourmockdrachtio.listen((data)=>{});
    const host = "127.0.0.1"
    const port = 27017;
    ourwp = new wp({reconnect:false});

    ourwp.connect({ host, port });
    await ourmockdrachtio.waitforclient();

    let completemessages=new Promise(resolve=>enough=resolve)
    const recevedmsgs=[]

    const nummessages = 100;
    ourwp.on('msg', (sock, msg) => {
      wpsocket=sock
      recevedmsgs.push(msg);

      if(recevedmsgs.length>=nummessages+1)
        enough()
    });

    for(let i=0;i<nummessages;i++){
      ourmockdrachtio.write(mixedbuffer);
    }

    ourmockdrachtio.write(Buffer.alloc(10000, '#'));

    await completemessages;

    /* after sending pottentiall corrupt utf string we should have reassembled it all and pull out the final message accuratly. */
    recevedmsgs[recevedmsgs.length-1].should.equal(Buffer.alloc(10000, '#').toString('utf-8'));
  });
});