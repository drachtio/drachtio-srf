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
