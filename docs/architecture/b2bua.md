# Back-to-Back User Agent (B2BUA)

In SIP architecture, a **Back-to-Back User Agent (B2BUA)** operates as both a User Agent Server (UAS) answering an incoming call and a User Agent Client (UAC) originating a new call, securely bridging the two. This model is useful for anonymizing callers, rewriting SDPs, intercepting in-dialog requests, recording calls, and enforcing security or routing policies.

## Implementing a B2BUA with `drachtio-srf`

`drachtio-srf` streamlines B2BUA implementation with a single method, `srf.createB2BUA`. By passing the incoming `req` and `res` objects (the 'A leg') alongside the destination URI for the outgoing request (the 'B leg'), the framework handles the complex timing of bridging SDP answers, negotiating 1xx provisional responses, handling `PRACK`s, managing proxy credentials, and handling 3xx redirects automatically.

### Basic Implementation

```typescript
srf.invite(async (req, res) => {
  try {
    // A B2BUA call forwards an incoming INVITE from A leg (req/res) to a B leg (sip:bob@example.com)
    const { uac, uas } = await srf.createB2BUA(req, res, 'sip:bob@example.com');
    
    console.log('B2BUA call established successfully!');
    
    // Wire up dialog destruction to propagate cleanly across the bridge
    uac.on('destroy', () => uas.destroy());
    uas.on('destroy', () => uac.destroy());
    
  } catch (err) {
    console.error('B2BUA call failed to establish', err);
  }
});
```

The method returns an object containing `{ uac, uas }`, which represent the outgoing (B leg) and incoming (A leg) `Dialog` objects, respectively. You can use these references to send mid-dialog messages (`INFO`, `UPDATE`) or tear down the calls entirely (`BYE`, via `destroy()`).

## B2BUA Options

`srf.createB2BUA()` accepts an options object granting fine-grained control over the SIP headers and SDP body bridging.

```typescript
const options = {
  // Pass non-200 OK failures back to the caller
  passFailure: true, 
  // Pass 18x ringing/progress responses back to the caller
  passProvisionalResponses: true,
  // Forward specific SIP Headers from A leg to B leg
  proxyRequestHeaders: ['X-Custom-Tracking-Id', 'Diversion'],
  // Forward specific SIP Headers from B leg (responses) back to A leg
  proxyResponseHeaders: ['X-Remote-Device-IP'],
  // Authenticate against the B leg gateway via digest auth
  auth: {
    username: 'my-gateway-user',
    password: 'super-secret-password'
  },
  // Rewrite SDP from the B leg before sending it to the A leg
  localSdpA: (sdpB, res) => {
    // e.g. modify the SDP string using an external library (like sdp-transform)
    return sdpB.replace(/a=sendrecv/g, 'a=sendonly'); 
  }
};

const { uac, uas } = await srf.createB2BUA(req, res, 'sip:outbound@gateway.internal', options);
```

By default, B2BUAs in `drachtio-srf` propagate in-dialog `UPDATE` and `CANCEL` requests seamlessly, removing boilerplate from standard call routing.

### Third-Party Call Control (3PCC)

A specialized version of B2BUA is **Third-Party Call Control (3PCC)**. In 3PCC, the controller initiates a UAC call to Leg A with no SDP. When Leg A answers with a 200 OK (containing its SDP offer), the controller uses that SDP to initiate a second UAC call to Leg B. Finally, the controller takes the SDP answer from Leg B and uses it to ACK Leg A.

You can orchestrate this manually by using `srf.createUAC` with the `noAck: true` property.

```typescript
// 1. Send UAC to Leg A with no local SDP
const legA = await srf.createUAC('sip:userA@domain.com', { noAck: true });

// 2. We received Leg A's 200 OK offer in `legA.res.body`
const legB = await srf.createUAC('sip:userB@domain.com', { localSdp: legA.res.body });

// 3. Acknowledge Leg A using Leg B's 200 OK answer SDP
await legA.ack(legB.remote.sdp);

// The two legs are now securely bridged!
```
