# Lifecycle Events

`drachtio-srf` applications rely on an event-driven architecture to communicate the state of SIP network links, call lifecycles, and dialog destruction. Both the main `Srf` application and the individual `Dialog` objects emit critical events.

## Application-Level Events (`Srf`)

The `Srf` instance acts as the master event emitter for global networking events, connection states, and raw SIP message handling.

### `connect`
Fired when `srf.connect(...)` successfully establishes a TCP or TLS connection with the backend drachtio server.

```typescript
srf.on('connect', (err, hostport, serverVersion, localHostports) => {
  if (err) console.error('Connection failed:', err);
  else console.log(`Connected to ${hostport} running version ${serverVersion}`);
});
```

### `listening`
Fired when `srf.listen(...)` successfully starts accepting inbound connections (running an embedded drachtio server or testing stub).

### `error`
Fired when the underlying socket encounters a transmission error, TLS handshake error, or drops a connection unexpectedly.

### `reconnecting`
Fired when the `Srf` client attempts to re-establish a dropped connection, following the backoff delays specified in the connection options.

### Global SIP Message Routing Events
When a generic `srf.on(...)` handler is bound to a SIP method, it executes for unhandled messages:
- `srf.on('request', (req, res) => ...)`
- `srf.on('message', (req, res) => ...)`
- `srf.on('invite', (req, res) => ...)`

## Dialog-Level Events (`Dialog`)

A `Dialog` represents an active SIP session (UAC, UAS, B2BUA legs). Dialogs emit events triggered by incoming SIP requests that arrive with a matching `Call-ID` and dialog tags (i.e. in-dialog requests).

By binding to a dialog's event emitters, you can cleanly implement features like mid-call SDP changes, hold/unhold patterns, and SIP call termination.

### `destroy`
Fired when the dialog is torn down. Usually invoked upon receiving a `BYE` request or a final `NOTIFY` response with a terminated subscription state.

```typescript
dialog.on('destroy', (msg, reason) => {
  console.log(`Dialog ended. Reason: ${reason}`);
  // Release database locks, write CDRs...
});
```

### Mid-Dialog SIP Requests
Dialogs emit events corresponding to the lower-level SIP Request method. For instance, receiving an `INFO` request inside a dialog emits an `info` event, and the user must respond appropriately.

- `info`: Fired when a SIP `INFO` request is received (e.g. DTMF payloads).
- `refer`: Fired when a SIP `REFER` request is received (e.g. blind transfers).
- `update`: Fired when a SIP `UPDATE` request is received (e.g. mid-call media adjustments without ringback).
- `message`: Fired when a SIP `MESSAGE` request is received in-dialog.

```typescript
dialog.on('info', (req, res) => {
  console.log('Received in-dialog INFO. Content type:', req.get('Content-Type'));
  
  if (req.get('Content-Type') === 'application/dtmf-relay') {
    res.send(200);
    console.log('Processed DTMF:', req.body);
  } else {
    res.send(415, 'Unsupported Media Type');
  }
});
```

### `modify`
A specialized event fired when an incoming in-dialog `INVITE` request modifies the session's SDP (e.g., adding video to an audio call, or holding the call).

```typescript
dialog.on('modify', (req, res) => {
  console.log('SDP Modified:', req.body);
  res.send(200, { body: myNewLocalSdp });
});
```

### `refresh`
Fired when an incoming in-dialog `INVITE` request refreshes the session timers but does *not* modify the underlying SDP content.

### `hold` / `unhold`
Synthesized events fired when a `modify` (re-INVITE) contains SDP parameters indicating the media should be stopped (`a=sendonly`, `a=inactive`, `c=0.0.0.0`) or resumed (`a=sendrecv`).

```typescript
dialog.on('hold', () => {
  console.log('Remote party put the call on hold!');
  // E.g. connect MoH stream
});

dialog.on('unhold', () => {
  console.log('Remote party resumed the call!');
});
```
