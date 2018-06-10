# drachtio-srf [![Build Status](https://secure.travis-ci.org/davehorton/drachtio-srf.png)](http://travis-ci.org/davehorton/drachtio-srf) [![NPM version](https://badge.fury.io/js/drachtio-srf.svg)](http://badge.fury.io/js/drachtio-srf)

[![drachtio logo](http://davehorton.github.io/drachtio-srf/img/definition-only-cropped.png)](http://davehorton.github.io/drachtio-srf)

Welcome to the Drachtio Signaling Resource framework (drachtio-srf), a module for building high-performance [SIP](https://www.ietf.org/rfc/rfc3261.txt) server applications in pure javascript.

drachtio-srf requires a network connection to a [drachtio server](https://github.com/davehorton/drachtio-server).  The drachtio server provides the sip transaction processing engine and is controlled by nodejs applications using the drachtio-srf module.

drachtio-srf concerns itself solely with SIP signaling; however, a companion framework, [drachtio-fsmrf](https://github.com/davehorton/drachtio-fsmrf), may be of interest to developers, as this framework allows the integration of media control (RTP) into SIP applications  using [Freeswitch](https://freeswitch.org) as a media server.
  
[API documentation for drachtio-srf can be found here](http://davehorton.github.io/drachtio-srf/api/index.html).

Table of Contents
=================

* [Getting Started](#getting-started)
* [Receiving SIP requests](#receiving-sip-requests)
* [Sending SIP requests](#sending-sip-requests)
  * [Dealing with local server IP addresses](#dealing-with-local-server-ip-addresses)
  * [Handling responses](#handling-responses)
* [Creating SIP Dialogs](#creating-sip-dialogs)
  * [Srf\#createUAS](#srfcreateuas)
  * [Srf\#createUAC](#srfcreateuac)
  * [Srf\#createB2BUA](#srfcreateb2bua)
* [More on SIP Dialogs](#more-on-sip-dialogs)
  * [Dialog events](#dialog-events)
* [Dialog properties](#dialog-properties)
* [Dialog methods](#dialog-methods)
* [Creating a SIP Proxy Server](#creating-a-sip-proxy-server)
* [Call Detail Records (CDRs)](#call-detail-records-cdrs)
* [Advanced middleware topics](#advanced-middleware-topics)
  * [License](#license)

## Getting Started

*Note:* The sample code below assumes that a drachtio server process is running on the localhost and is listening for connections from applications on port 9022 (tcp).

Applications connect to a drachtio server as follows:

```js
const Srf = require('drachtio-srf');
const srf = new Srf() ;
srf.connect({
  host: '127.0.0.1',
  port: 9022,
  secret: 'cymru'
}) ;
srf
  .on('connect', (err, hostport) => {
    if (err) return console.log(`error connecting: ${err}`);
    console.log(`successfully connected to drachtio server accepting SIP traffic on: ${hostport}`);
  })
  .on('error', (err) => {
    console.log(`srf error: ${error}`);
  });
```

> Note: It is recommended to always listen for 'error' events, as above, because drachtio-srf will automatically reconnect to the drachtio server if the connection is lost for some reason as long as your application listens for 'error' events.

##  Receiving SIP requests

For those familiar with node.js middleware frameworks (such as connect, express, koa, etc) drachtio-srf takes a similar approach for receiving SIP requests and sending responses.

```js
srf.invite((req, res) => {
  console.log(`received SIP INVITE from {req.source_address} with Call-id {req.get('Call-Id')}`);
  res.send(486); // Busy Here
}) ;

```

## Sending SIP requests

Now that we've seen how to handle incoming requests and generate a response, let's cover how to send a SIP request.  As we will see shortly, drachtio-srf provides some higher-level methods for creating and working with SIP dialogs that we will often use, but at a simple API exists to send out a SIP request:

```js
srf.request('sip:daveh@drachtio.org', {
  method: 'INVITE'
  headers: {
    'User-Agent': 'my great app/1.0'
  },
  body: someSdp
}, (err, req) => {
  // err - error sending, or null if successful
  // req - if successful, the request that was actually sent out over the wire
})
```

In the example above, we sent out an INVITE.  

But what about all of the required headers that we did not supply?  `Call-Id`, `CSeq`, `From`, and `To` are all required headers for an INVITE, but in the example above the application did not supply them.  What would have happened?  

Well, the drachtio server will set appropriate default values for these (and a few other) headers if the application does not provide them (because, of course we could have supplied value above in the `headers` object).  

The defaults will be set as follows:

* `Call-Id` - will be set to a randomly-generated unique uuid (there is rarely a reason for an app to explicitly set Call-Id or CSeq)
* `CSeq` - will be set to `1 INVITE`
* `From` - will be set to `sip:{hostport}` where hostport is the sip address that drachtio server is listening on
* `To` - will be set to `sip:{user}@{hostport}` where user is taken from the sip uri provided
* `Content-Type` - will be set to `application/sdp` if a `body` property containing a session description protocol is provided; in all other cases the application *must* explicitly set the Content-Type header.
* `Via` - In all cases, the drachtio server will construct the proper Via header.  Applications should never specify a Via header in the `headers` object.

### Dealing with local server IP addresses

Often, an application *will* want to specify a `From`, a `To`, or a `Contact` header.  It can be a challenge to put the proper IP address (and possibly, sip port) in the hostport part of the sip uris -- that is, the sip address that the connected drachtio server is actually listening on.  Because the drachtio server may be running on a remote server, and furthermore, may be listening on multiple sip hostports, it is a non-trival exercise for an application to populate correctly into these headers.

The solution is to let the drachtio server fill in this part of the header by simply using the string `placeholder` in the provided header, e.g.:

```js
srf.request('sip:daveh@drachtio.org', {
  method: 'INVITE'
  headers: {
    'From': '<sip:5083084809@placeholder>',
    'To': '<sip:+16173333456@placeholder>'
  },
  body: someSdp
}, (err, req) => {...})

```
> Note: do not provide a `tag=` attribute when specifying a `From` or `To` header.  The drachtio server will generate tags as needed for all requests and responses.

### Handling responses

Now that we know how to send a request, what about receiving the associated response?

This can be done by listening to the `response` event associated with the `req` object provided in the callback (i.e., the req object is an event emitter):

```js
srf.request('sip:daveh@drachtio.org', {
  method: 'OPTIONS'
}, (err, req) => {
  if (err) return console.log(`error sending OPTIONS: ${err}`);
  req.on('response', (res) => {
    console.log(`got a ${res.status} to my OPTIONS request`);
  })
})
```

An INVITE is a special case when it comes to sending requests, because besides receiving the response(s) a final ACK must be sent.

For non-200 OK final responses to an INVITE, the drachtio server will automatically generate the ACK, but for a successful 200 OK response the application must generate the ACK (this is because there are some scenarios where the ACK could carry an SDP as well).

To do so, in the case of an INVITE request, the `response` event will have a second parameter which is a function that the application should call to generate the ACK; e.g.:

```js
srf.request('sip:daveh@drachtio.org', {
  method: 'INVITE'
  headers: {
    'From': '<sip:5083084809@placeholder>',
    'To': '<sip:+16173333456@placeholder>'
  },
  body: someSdp
}, (err, req) => {
  if (err) return console.log(`error sending INVITE: ${err}`);

  req.on('response', (res, ack) => {
    if (200 === res.status) {
      ack(); // success !
    }
  });
});
```

## Creating SIP Dialogs

The examples above show how to send and receive individual SIP messages, but drachtio-srf also provides APIs to work with the [higher-level concept of SIP dialogs](https://tools.ietf.org/html/rfc3261#section-12).  A SIP dialog is established through INVITE (or SUBSCRIBE) messages and represents a long-lived signaling and media connection between two endpoints.  SIP dialogs can be created, modified, and destroyed using drachtio-srf.  

The API allows developers to create user agent servers (i.e., a SIP dialog initiated by responding to an incoming SIP INVITE), user agent clients (dialogs created by initiating a new SIP INVITE request), and back-to-back user agents.  

All of the API methods below supporting returning a created dialog object either via a callback or returning a Promise.

### Srf#createUAS

Use this method to respond to an incoming INVITE and establish a sip dialog as a user agent server.

returning a Promise:
```js
srf.invite((req, res) => {
  srf.createUAS(req, res, {
    localSdp: someSdp  // a string, or
                      //  a function returning a Promise that resolves to a string
  })
    .then((dialog) => {
      console.log('successfully created UAS dialog');
      dialog.on('destroy', () => {
        console.log('remote party hung up');
      });
    });
    .catch((err) => {
      console.log(`Error creating UAS dialog: ${err}`);
    }) ;
});
```
using a callback:
```js
srf.invite((req, res) => {
  srf.createUAS(req, res, {
    localSdp: someSdp  
  }, (err, dialog) => {
    if (err) {
      return console.log(`Error creating UAS dialog: ${err}`);
    }
    console.log('successfully created UAS dialog');
    dialog.on('destroy', () => {
      console.log('remote party hung up');
    });
  });
});
```
headers can also be supplied in the usual way:
```js
srf.createUAS(req, res, {
  localSdp: someSdp,
  headers: {
    'X-My-Header': 'custom headers too!'
  }
}).then((dialog) => {...});
```

### Srf#createUAC

Use this to generate an INVITE and establish a sip dialog as a user agent client.

returning a Promise:
```js
srf.createUAC(uri, {
  localSdp: someSdp
})
  .then((dialog) => {....})
  .catch((err) => {
    console.log(`INVITE failed with final status ${err.status}`);
  });
```
using a callback:
```js
srf.createUAC(uri, {
  localSdp: someSdp
}, {}, (err, dialog) => {....});
```
The third parameter in method call above (the empty object `{}`) is an object that can optionally contain additional callbacks to provide information during the call establishment phase.  When using a callback, it must be there - even as an empty object - in order to satisfy the correct method signature.
```js
srf.createUAC(uri, {
  localSdp: someSdp
}, {
  cbRequest: ((req) => {...}),       //  INVITE request that was sent over the wire
  cbProvisional: ((res) ==> {....})  // a 180 or 183 provisional response that was received
}, (err, dialog) => {....});
```
As usual, headers can also be specified in the normal manner.  

Furthermore, `opts.callingNumber` and `opts.calledNumber` can be specified as a convenient way to provide the calling and called phone numbers that should appear in the `From`, `To` and `Contact` headers (once again, the remainder of the header values, including the sip address, will be automatically filled out by the drachtio server):
```js
srf.createUAC(uri, {
  localSdp: someSdp,
  callingNumber: '+15083084809',  // => From: sip:+15083084809@...
  calledNumber: '+6173333456',    // => To: sip:+16173333456@..
  headers: {
    Subject: 'outbound call'
  }
}).then((dialog) => {....});
```
A SUBSCRIBE dialog can be created as well:
```js
srf.createUAC(uri, {
  localSdp: someSdp,
  method: 'SUBSCRIBE'
})
  .then((dialog) => {....})
  .catch((err) => {
    console.log(`SUBSCRIBE failed with final status ${err.status}`);
  });
```
### Srf#createB2BUA

Use this to create a back-to-back user agent.

returning a Promise:
```js
srf.invite((req, res) => {
  srf.createB2BUA(req, res, uri, {
    localSdp: req.body
  })
    .then(({uas, uac}) => {
      console('successfully connected call');

      // propogate BYE from one leg to the other
      uas.on('destroy', () => {uac.destroy();})
      uac.on('destroy', () => {uas.destroy();})
    })
    .catch((err) => {
      console.log(`INVITE failed with final status ${err.status}`);
    });  
});
```
using a callback:
```js
srf.createB2BUA(req, res, uri, {
  localSdp: someSdp
}, {
  cbRequest: ((req) => {...}),      // INVITE request that was sent over the wire to B party 
  cbProvisional: ((res) ==> {...}), // a 180 or 183 provisional response that was received from B party
  cbFinalizedUac: (uac) => {...}    // if you need the created UAC dialog as soon it is created 
                                    // i.e, as soon as 200 OK received by B, 
                                    // before 200 OK/ACK exchanged with A 
}, (err, {uas, uac}) => {....});
```
It is also possible to provide a list of headers that should be propogated from the incoming INVITE to the outgoing one (or vice versa on responses traveling back upstream):
```js
srf.createB2BUA(req, res, uri, {
  localSdp: req.body,
  proxyRequestHeaders:['Subject', 'User-Agent'],
  proxyResponseHeaders: ['Server']
})
  .then(({uas, uac}) => {
    console('successfully connected call');

    // propogate BYE from one leg to the other
    uas.on('destroy', () => {uac.destroy();})
    uac.on('destroy', () => {uas.destroy();})
  })
  .catch((err) => {
    console.log(`INVITE failed with final status ${err.status}`);
  });  
```
## More on SIP Dialogs
All of the APIs above create a SIP dialog object, which is an event emitter.  For full details, [please see the API documentation](http://davehorton.github.io/drachtio-srf/api/Dialog.html).  Developers will interact with dialogs to listen for events, call methods, and read properties.  An overview of the most common interfaces is described below:

### Dialog events
The most important event is the `destroy` event, which is triggered when a BYE is received for a SIP dialog (or a NOTIFY with Subscription-State: terminated for a SUBSCRIBE dialog).  Applications should always listen for the 'destroy' event and take appropriate action (e.g., write a cdr, destroy related dialogs, etc).

Other events include `modify` when a reINVITE is received with a changed SDP.  The application is responsible for sending a response to the re-INVITE in this case, and the event callback provides the `req, res` objects for this purpose.

In the case of an INVITE on hold (or off hold), the dialog will emit the `hold` or `unhold` event. No action by the application is necessary, as the framework will generate the appropriate response.

Similarly, if a session timer refreshing re-INVITE is received, a `refresh` event is emitted and no action is required by the application.

## Dialog properties
Some of the more commonly-accessed properties are as follows:
* the `sip` object, which includes the `callId`, `remoteTag`, and `localTag` string properties; these [uniquely define a SIP dialog](https://tools.ietf.org/html/rfc3261#section-12)
* the `local` object, which provides information related to the local side of the dialog: the `uri`, `sdp`, and `contact` properties
* the `remote` object, which contains the `uri` and `sdp` properties for the remote side of the dialog
* `connected`, which is true if the dialog is active, false otherwise
* `onHold`, which is true if the dialog is currently in an on-hold state, false otherwise.

## Dialog methods
The most common method is `destroy`, which tears down a SIP dialog by sending a BYE (and a SUBSCRIBE dialog by sending a NOTIFY with Subscription-State: terminated).  The `destroy` method optionally takes one parameter, a callback which provides the SIP message sent over the wire (BYE or NOTIFY).

```js
// if I need to wait till I get a response to the BYE..
dlg.destroy((bye) => {
  bye.on('response', (msg) => {
    console.log(`response to bye on ${bye.get('Call-Id)} was ${msg.status}'));
  });
})
```
The dialog also exposes a `modify` method, which can be used to modify the session description protocol.  It can be used in any of the following ways:
```js
// provide a modified sdp for the local side of the dialog..
dlg.modify(newSdp, (err) => {
  // on success, dlg.remote.sdp will have the new remote sdp
}); 
                                    
// put the dialog on hold (sdp is automatically generated)
dlg.modify('hold', (err) => {...}); 

// take the dialog off hold (sdp is automatically generated)
dlg.modify('unhold', (err) => {....}) 
```

## Creating a SIP Proxy Server
Creating a SIP proxy server is quite simple:
```js
srf.invite((req, res) => {

  // simple outbound proxy - 
  // INVITE is proxied to the sip uri in the inbound request header
  srf.proxyRequest(req, res);

  // proxy to a specified destination
  srf.proxyRequest( req, 'sip:next.hop.com');

  // lots of options available, 
  // plus a callback to indicate success if needed
  srf.proxyRequest( req, ['sip:try.this.com', 'sip:try.that.com'], {
    recordRoute: true,
    forking: 'sequential',
    followRedirects: true,
    provisionalTimeout: '2s',
    finalTimeout: '20s',
    headers: {
      Subject: 'my subject header'
    }
  }, (err, result) => {
    console.log(JSON.stringify(result)); // {finalStatus: 200, finalResponse:{..}, responses: [..]}
  });
});
```
For full details, [see here](http://davehorton.github.io/drachtio-srf/api/Srf.html#proxyRequest#)

## Call Detail Records (CDRs)
Applications can connect to the drachtio server and receive call detail record information about all calls passing through the server.  It is possible to create an application that both performs call control and receives call detail record information; as well, it is possible to separate these into separate applications.

Call detail records are emitted as events on the drachtio server framework instance that is created by `new Srf();`.

Three type of cdr events are emitted:
* a `cdr:attempt` event, when an INVITE is received by or generated from the server
* a `cdr:start` event, when a final success response to an INVITE is received by or sent from the server
* a `cdr:end` event, when either a final non-success response to an INVITE is received or sent, or a BYE is processed for an existing call leg.

Given the above, for each call attempt there will always be a `cdr:attempt` and a `cdr:end` event, but only `cdr:start` event for connected calls.

```js
const Srf = require('drachtio-srf');
const srf = new Srf() ;

srf.connect({..});

srf.on('cdr:attempt', (source, time, msg) => {
  console.log(`${msg.get('Call-Id')}: got attempt record from ${source} at ${time}`) ;
  // source: 'network' or 'application'
  // time: UTC time message was sent or received by server
  // msg: object representing INVITE message that was sent or recieved
}) ;

srf.on('cdr:start', (source, time, role, msg) => {
  console.log(`${msg.get('Call-Id')}: got start record from ${source} at ${time} with role ${role}`) ;
  // role: 'uac', 'uas', 'uac-proxy', or 'uas-proxy'
  // msg: object representing 200 OK that was sent or received
}) ;

srf.on('cdr:stop', (source, time, reason, msg) => {
  console.log(`${msg.get('Call-Id')}: got end record from ${source} at ${time} with reason ${reason}`) ;
  // reason: reason the call was ended: 
  //      'call-rejected', 'call-canceled', 'normal-release', 'session-expired', 
  //      'system-initiated-termination', or 'system-error-initiated-termination'
  // msg: object representing BYE message that was sent or received
});

```

## Advanced middleware topics
Similar to many http-based nodejs servers, drachtio-srf supports the concept of middleware with the 'use' method. 

```js
const config = require('config');
const rangeCheck = require('range_check');
...
srf.use((req, res, next) => {
  if( !rangeCheck.inRange( req.source_address, config.get('authorizedSources') ) { 
    return res.send(403) ; 
  }
  next() ;
}) ;
srf.invite((req, res) => {
  // only authorized sources get here..
})
```
Middleware can optionally be mounted only for specific SIP request types (methods) by specifying the method type (lower-cased) as an optional first parameter. 

```js
srf.use('register', (req, res, next) => {..});
```
There are special cases of "error-handling" middleware. These are middleware where the function takes exactly 4 arguments. Errors that occur in the middleware added before the error middleware will invoke this middleware when errors occur.

```js
srf.use(middleware1);
srf.use(middleware2)
srf.use(function (err, req, res, next) {
  // an error occurred!
});
srf.invite((req, res) => {...});
```
