# Overview

Drachtio signaling resource framework (SRF) is a higher-level SIP signaling framework for [drachtio](https://github.com/davehorton/drachtio).

It is designed to allow developers to easily create and manipulate SIP Dialogs (i.e. calls) without having to manage the details of sending/receiving/processing all of the required lower-level SIP messages.

```js
var app = require('drachtio')();
var Srf = require('drachtio-srf'); 
var srf = new Srf(app) ;

app.connect({..}) ;
app.on('connect', function() {
  srf.createUacDialog( '127.0.0.1:5061', {
    calledNumber: '5082236177',
    callingNumber: '6173333456',
    localSdp: req.msg.body,
    headers: {
      'User-Agent': 'drachtio-srf'
    }
  }, function(err, dialog ) {
    if( err ) throw err ;
    console.log('created user agent client sip dialog: %s', 
      JSON.stringify(dialog)) ;
      ....
      dialog.destroy() ;
  }) ;
}) ;
```

#Features

#Examples

#API


