[![drachtio logo](http://davehorton.github.io/drachtio-srf/img/definition-only-cropped.png)](http://davehorton.github.io/drachtio-srf)

Welcome to the drachtio signaling resource framework, empowering nodejs/javascript developers to build highly-scalable SIP application servers -- without requiring a Ph.D in [SIP](https://www.ietf.org/rfc/rfc3261.txt) or VoIP :)

drachtio is an open-source, nodejs-based ecosystem for creating any kind of VoIP server-based application: registrar, proxy, back-to-back user agent, and many others. Furthermore, when coupled with the drachtio [media resource function](https://github.com/davehorton/drachtio-fsmrf) module, rich media-processing applications can be easily built as well.

Within the drachtio ecosystem, drachtio-srf is a high-level abstraction framework that sits on top of the [connect](https://github.com/senchalabs/connect)-inspired [drachtio](https://github.com/davehorton/drachtio) library, and allows the developer to easily create and manage SIP [Dialogs](http://davehorton.github.io/drachtio-srf/api/Dialog), without the burden of tending to the details of lower-level SIP transactions and messages.

*Note:* API documentation for drachtio-srf [can be found here](http://davehorton.github.io/drachtio-srf/api/index.html).

```js
var app = require('drachtio')();
var Srf = require('drachtio-srf'); 
var srf = new Srf(app) ;

// connect to drachtio server
srf.connect({..}) ;

srf.invite( function(req, res) {

  // respond to incoming INVITE request by creating a user agent server dialog
  srf.createUasDialog( req, res, {
    localSdp: myLocalSdp,
    headers: {
      'Server': 'drachtio-srf Server'
    }
  }, function(err, dialog) {
    if( err ) { throw err ; }
    console.log('created user-agent server dialog: ', JSON.stringify(dialog)) ;

    // set up dialog handlers
    dialog.on('destroy', onCallerHangup) ;
}) ;
function onCallerHangup(msg) {
  console.log('caller hung up, incoming BYE message looked like this: ', msg) ;
}
``` 

## Getting Started
*Note:* drachtio-srf applications require a network connection to a [drachtio server](https://github.com/davehorton/drachtio-server) process that sits in the VoIP network and handles the low-level SIP messaging.

### Install drachtio-srf
```bash
npm install drachtio-srf --save
```

### Create an instance of the signaling resource framework
First, create a drachtio "app".  This contains the middleware stack and core message routing functions.  Next, create a new instance of the drachtio signaling resource framework, passing the drachtio app that you just created.

```js
var drachtio = require('drachtio') ;
var app = drachtio();
var Srf = require('drachtio-srf'); 
var srf = new Srf(app) ;
```

### Use middleware
Similar to connect, drachtio supports the concept of middleware with the 'use' method. (The 'use' method may equivalently be called on the 'srf' instance, or the underlying 'app').

```js
var rangeCheck = require('range_check');
...
srf.use(function (req, res, next) {
  if( !rangeCheck.inRange( req.source_address, config.authorizedSources) ) { 
    return res.send(403) ; 
  }
  next() ;
}) ;
```

### Mounting middleware
Middleware can optionally be mounted only for specific SIP request types (methods) by specifying the method type (lower-cased) as an optional first parameter. 

```js
srf.use('register', parseRegister) ;
```

### Error middleware
There are special cases of "error-handling" middleware. There are middleware where the function takes exactly 4 arguments. Errors that occur in the middleware added before the error middleware will invoke this middleware when errors occur.

```js
srf.use(function (err, req, res, next) {
  // an error occurred!
});
```

### Connect to a drachtio server
The drachtio server process provides the actual sip processing engine that can be controlled by one or more drachtio clients.  Therefore, a drachtio-srf application must initially invoke the "connect" method on the srf instance (or, equivalently, on the underlying drachtio "app" object) to establish a connection to the drachtio server process in order to receive events (e.g. SIP messages) as well as send requests.  

The application may either provide a callback to the "connect" call, or may listen for the "connect" event in order to determine whether/when a connection has been achieved.

```js
srf.connect({
  host: {ip address to connect to},
  port: {port to connect to},
  secret: {shared secret client must provide to authenticate to drachtio server}
}, function(hostport) {
  console.log('connected to server listening for SIP messages on %s': hostport) ;
}) ;

// or, instead of callback
srf.on('connect', function(err, hostport){
  if( err ) throw err ;
  console.log('connected to server listening for SIP messages on %': hostport) ;  
}) ;
```

### Creating dialogs
At this point, your application is ready to start interacting with a VoIP/SIP network; generating or receiving SIP requests and creating dialogs. The relevant methods on the 'srf' instance are:

* [createUasDialog](http://davehorton.github.io/drachtio-srf/api/Srf.html#createUasDialog)
* [createUacDialog](http://davehorton.github.io/drachtio-srf/api/Srf.html#createUacDialog)
* [createBackToBackDialogs](http://davehorton.github.io/drachtio-srf/api/Srf.html#createBackToBackDialogs)
* [proxyRequest](http://davehorton.github.io/drachtio-srf/api/Srf.html#proxyRequest)

### Managing dialogs
Once you have created a dialog, you will want to be able to respond to events as well as exert control over the dialog by calling methods.

#### Dialog events</h5>
* ['destroy'](http://davehorton.github.io/drachtio-srf/api/Dialog.html#event:destroy) - fired when the remote end has sent a BYE request (i.e., the remote end has hung up).  No action is required in the associated callback: this is a notification-only event.
* ['refresh'](http://davehorton.github.io/drachtio-srf/api/Dialog.html#event:refresh) - fired when the remote end has sent a refreshing re-INVITE.  No action is required in the associated callback: this is a notification-only event.
* ['modify'](http://davehorton.github.io/drachtio-srf/api/Dialog.html#event:modify) - fired when the remote end has sent a re-INVITE with a modified session description (i.e. SDP). drachtio request and response objects are provided to the event handler, and the application must respond to the re-INVITE by invoking the 'res.send' method.</li>
* ['info', 'notify', 'refer', 'update'](http://davehorton.github.io/drachtio-srf/api/Dialog.html#event:info) -- fired when the remote end has sent a request within the dialog of the specified request type. drachtio request and response objects are provided to the event handler, and the application must respond to the re-INVITE by invoking the 'res.send' method. (Note: if the application does not register a listener for this class of event, a 200 OK with an empty body will automatically be generated in response to the incoming request).

#### Dialog methods
* [destroy](http://davehorton.github.io/drachtio-srf/api/Srf.html#destroy) - terminates the dialog (i.e. sends a BYE to the far end)
* [modify](http://davehorton.github.io/drachtio-srf/api/Srf.html#modify) - modifies the dialog media session; either placing or removing the call from hold, or re-INVITING the far end to a new media session description
* [request](http://davehorton.github.io/drachtio-srf/api/Srf.html#request) - send a request within a dialog (e.g. INFO, NOTIFY, etc)

## Sample applications</h4>
* [Load-balancing SIP proxy](https://github.com/davehorton/simple-sip-proxy)
* [Two-stage dialing application](https://github.com/davehorton/drachtio-sample-twostage-dialing)

## License
[MIT](https://github.com/davehorton/drachtio-srf/blob/master/LICENSE)
