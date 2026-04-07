# drachtio-srf ![Build Status](https://github.com/drachtio/drachtio-srf/workflows/CI/badge.svg)

> **Note**: This repository has been refactored into strict, modern TypeScript. The original JavaScript source has been migrated to TypeScript and is now compiled down into the generated `lib/` directory. All credit for the brilliant underlying `drachtio-srf` implementation, API design, and architecture belongs to the original author, **Dave Horton**.

[![drachtio logo](http://davehorton.github.io/drachtio-srf/img/definition-only-cropped.png)](https://drachtio.org)

Welcome to the Drachtio Signaling Resource framework (drachtio-srf), the Node.js framework for SIP Server applications.

Please visit [drachtio.org](https://drachtio.org) for getting started instructions, API documentation, sample apps and more!

## Development and Architecture Changes
To provide an enhanced developer experience and complete type safety, this project has been updated to native TypeScript:
- **TypeScript Sources:** All code under `src/` (formerly `lib/`), `test/`, and `examples/` is now written in `.ts`.
- **Git Tracking & Ignored Files:** The compiled `lib/` and the isolated `test-dist/` directories are untracked and purposefully added to `.gitignore`. They are strictly considered auto-generated outputs and are rebuilt by running `npm run build`.
- **NPM Compatibility:** When installed via NPM, end-users will seamlessly download the generated vanilla JavaScript contents inside the `lib/` folder. This ensures 100% backward compatibility across standard Node.js applications, leaving typical `require('drachtio-srf')` implementations unbroken.

## New Features & Strict Typing API
In addition to the fundamental TS transition, several advanced features and typing improvements have been shipped:
- **`AbortSignal` Support for Outbound Requests (`createUAC`)**: You can now supply an `AbortSignal` inside the `opts.signal` parameter when initiating outgoing dialogs with `srf.createUAC(uri, { signal: ... })` or within `createB2BUA`. If the signal is aborted while a request is pending, it instantly transmits a `CANCEL` to the remote endpoint, terminates all associated listeners/timers, and throws an immediate `AbortError` exception to easily reject the executing promise.
- **Strictly Typed Event Emitters:** `Srf` and `Dialog` event structures are now mapped against comprehensive interface definitions (`SrfEvents`, `DialogEvents`). Instead of guessing string names and parameters when using `srf.on('message', ...)`, your IDE will automatically validate event names and strictly type your callbacks (e.g. `(req: Request, res: Response) => void`).
- **Domain-Specific Interfaces:** `CreateUACOptions`, `CreateUASOptions`, `CreateB2BUAOptions`, and `SrfConfig` have been formalized. These interfaces explicitly declare acceptable optional logic like `noAck`, `proxyRequestHeaders`, and `followRedirects`—drastically eliminating loosely tracked `any` configurations across the architecture.
- **Strict Parser Types:** Output properties parsed using the embedded SIP Parser like `Via` and `AOR` (`ParsedUri`) are natively typed and exported inside `SipMessage` so you safely infer `uri.user` and `uri.host`.

*Example proxy*
```js
  const Srf = require('drachtio-srf');
  const srf = new Srf();

  srf.connect({
    host: '192.168.32.5',
    port: 9022,
    secret: 'cymru'
  });
  
  srf.invite((req, res) => {
    srf.proxyRequest(req, ['sip.example1.com', 'sip.example2.com'], {
      recordRoute: true,
      followRedirects: true,
      provisionalTimeout: '2s'
    }).then((results) => {
      console.log(JSON.stringify(result)); 
      // {finalStatus: 200, finalResponse:{..}, responses: [..]}
    });
  });
  ```
*Example Back-to-back user agent*
  ```js
  const Srf = require('drachtio-srf');
  const srf = new Srf();

  srf.connect({
    host: '192.168.32.5',
    port: 9022,
    secret: 'cymru'
  });
    const Srf = require('drachtio-srf');
  const srf = new Srf();

  srf.invite((req, res) => {
    srf.createB2BUA('sip:1234@10.10.100.1', req, res, {localSdpB: req.body})
      .then(({uas, uac}) => {
        console.log('call connected');

        // when one side terminates, hang up the other
        uas.on('destroy', () => { uac.destroy(); });
        uac.on('destroy', () => { uas.destroy(); });
        return;
      })
      .catch((err) => {
        console.log(`call failed to connect: ${err}`);
      });
  });
  ```
*Example sending a request (OPTIONS ping)*
  ```js
  const Srf = require('drachtio-srf');
  const srf = new Srf();

  srf.connect({host: '127.0.0.1', port: 9022, secret: 'cymru'});

  srf.on('connect', (err, hp) => {
    if (err) return console.log(`Error connecting: ${err}`);
    console.log(`connected to server listening on ${hp}`);

    setInterval(optionsPing, 10000);
  });

  function optionsPing() {
    srf.request('sip:tighthead.drachtio.org', {
      method: 'OPTIONS',
      headers: {
        'Subject': 'OPTIONS Ping'
      }
    }, (err, req) => {
      if (err) return console.log(`Error sending OPTIONS: ${err}`);
      req.on('response', (res) => {
        console.log(`Response to OPTIONS ping: ${res.status}`);
      });
    });
  }
  ```
