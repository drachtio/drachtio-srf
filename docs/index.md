# drachtio-srf

**drachtio-srf** (Signaling Resource Framework) is a Node.js framework for building SIP server applications, deeply inspired by the popular Express.js web framework.

It allows developers to build complex SIP User Agents (UAS, UAC, and B2BUA) with a minimal and highly readable codebase. By utilizing an intuitive middleware pattern, developers can intercept, manipulate, and route SIP messages naturally.

## Core Concepts

- **Express-style Middleware**: Intercept requests natively based on their SIP method (`INVITE`, `REGISTER`, etc.) or pass them through a sequence of functions using `use()`. [Read more](./architecture/middleware-routing.md)
- **Dialog Management**: Built-in support for maintaining state across SIP dialogs (both UAS and UAC) and acting as a Back-to-Back User Agent. [Read more](./architecture/b2bua.md)
- **Event-Driven Architecture**: Easily attach listeners to track dialog lifecycles, network errors, and low-level protocol events. [Read more](./architecture/lifecycle-events.md)

## Basic Usage

To get started, instantiate the `Srf` application and connect it to your drachtio server.

```typescript
const Srf = require('drachtio-srf');
const srf = new Srf();

// Connect to a running drachtio server
srf.connect({
  host: '127.0.0.1',
  port: 9022,
  secret: 'cymru'
});

srf.on('connect', (err, hostport) => {
  if (err) return console.error('Connection failed: ', err);
  console.log(`Connected successfully to ${hostport}`);
});

// Intercept all incoming OPTIONS requests and respond with 200 OK
srf.options((req, res) => {
  res.send(200, 'OK');
});

// Intercept incoming INVITE requests to act as a UAS
srf.invite(async (req, res) => {
  try {
    const dialog = await srf.createUAS(req, res, {
      localSdp: 'v=0\r\no=- 123456 1 IN IP4 127.0.0.1\r\ns=-\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 10000 RTP/AVP 0 8\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\na=sendrecv'
    });
    
    console.log('Successfully established UAS dialog!');
    
    dialog.on('destroy', () => {
      console.log('Dialog was terminated by remote party');
    });

  } catch (err) {
    console.error('Failed to create UAS dialog', err);
  }
});
```

## API Reference

For detailed documentation on the primary objects and their capabilities, refer to the API guides:

- [Srf API](./api/srf.md) - The main framework application
- [Dialog API](./api/dialog.md) - Managing active SIP dialogs
- [Request API](./api/request.md) - Interrogating and handling SIP Requests
- [Response API](./api/response.md) - Formatting and dispatching SIP Responses
- [SipError API](./api/sip_error.md) - Handling protocol-level exceptions
