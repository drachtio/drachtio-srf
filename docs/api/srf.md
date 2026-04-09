# Srf

The `Srf` class represents a `drachtio-srf` application connected to a Drachtio server. It offers methods to establish connections, listen for incoming connections, declare middleware processing routes for incoming requests, create SIP dialogs (UAC, UAS, and B2BUA), proxy requests, and emit generic outbound requests.

## Instantiation

```typescript
const Srf = require('drachtio-srf');
const srf = new Srf();
```

## Setup & Configuration

### `connect(opts: SrfConfig, callback?: Function)`
Connects the application to an actively running remote or local Drachtio server using a TCP or TLS connection.

- **`opts`**: Connection configuration (see `SrfConfig` below).
- **`callback`**: Called once successfully connected, matching the `connect` event.

### `listen(opts: SrfConfig, callback?: Function)`
Starts an embedded drachtio server listener process that allows inbound SIP traffic.

- **`opts`**: Listen configuration.
- **`callback`**: Called once the server begins listening.

### `SrfConfig` Object
- `host` *(string)*: Server IP or hostname.
- `port` *(number)*: Network port.
- `secret` *(string)*: Drachtio shared secret for authenticating the connection.
- `tls` *(object)*: Standard Node.js TLS configuration keys (e.g. `key`, `cert`).
- `enablePing` *(boolean)*: Keep connections alive using frequent ping frames.
- `pingInterval` *(number)*: Time in milliseconds between pings.

## Routing Middleware

`Srf` routes incoming SIP Requests natively based on the method name using Express.js-style middleware paths.

### `use(fn: Function)`
Attach a generic middleware function executed on *all* incoming requests.

### `invite(handler: Function)`
### `register(handler: Function)`
### `options(handler: Function)`
### `bye(handler: Function)`
### `cancel(handler: Function)`
### `info(handler: Function)`
### `notify(handler: Function)`
### `message(handler: Function)`
### `prack(handler: Function)`
### `publish(handler: Function)`
### `refer(handler: Function)`
### `subscribe(handler: Function)`
### `update(handler: Function)`

**Handler Signature**: `(req: Request, res: Response, next: Function) => void`

## Dialog Creation

Dialogs are long-lived SIP sessions. They maintain internal state routing details (`Call-ID`, tags, CSeq) and handle retransmissions, PRACK, and SDP negotiation. 

### `createUAS(req, res, opts?: CreateUASOptions)`
Creates a User Agent Server (UAS) dialog by parsing an incoming Request (e.g., an `INVITE`) and immediately sending a success Response (e.g., `200 OK`) or an early media response.
- Returns a `Promise<Dialog>`.

### `createUAC(uri, opts?: CreateUACOptions, callbacks?: ProgressCallbacks)`
Creates an outbound User Agent Client (UAC) dialog to the given SIP URI.
- Returns a `Promise<Dialog>` once the UAC has been established (i.e. receives a 2xx response).

### `createB2BUA(req, res, uri, opts?: CreateB2BUAOptions)`
A combination of both UAC and UAS creation. Proxies the incoming Request to a UAC leg, bridges the SDP media answers, and finalizes the UAS leg.
- Returns a `Promise<{ uac: Dialog, uas: Dialog }>` representing both legs of the call.

## Stateless Request Routing

### `request(opts: OutboundRequestOptions & { uri: string })`
Fires an arbitrary outbound SIP Request without attempting to construct or bind to a long-lived dialog.
- Returns a `Promise<Request>` allowing you to capture the resulting response (via `req.on('response')`).

### `proxyRequest(req, destination, opts?: ProxyRequestOptions)`
Statelessly proxies an incoming Request to a new destination (or multiple parallel destinations via arrays). This operates at the *transaction* level rather than the *dialog* level.
- Returns a `Promise<any>`.

## Properties & Lookups

### `locals: Record<string, any>`
A generic object attached to the application for persisting custom data across middleware components (analogous to `app.locals` in Express).

### `idle: boolean`
Returns `true` if there are currently no pending transactions or routing operations active inside the agent.

### `findDialogById(stackDialogId: string): Dialog | undefined`
Look up an active Dialog using the unique identifier assigned by the Drachtio server.

### `findDialogByCallIDAndFromTag(callId: string, tag: string): Dialog | undefined`
Look up an active Dialog using the SIP `Call-ID` header and the local `From` header tag.