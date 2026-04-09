# Response

The `Response` object handles sending a SIP message in response to an incoming `Request`. You generally receive a `res` object as the second parameter in your middleware callbacks.

## Properties

### `status` *(number)*
The numeric SIP status code currently set on the response (e.g., 200, 404).

### `reason` *(string)*
The text phrase associated with the status code (e.g., 'OK', 'Not Found').

### `body` *(string)*
The raw payload sent along with the response (usually SDP).

### `headers` *(Record<string, string>)*
A collection of SIP headers bound to the response. Modifying them via `.set()` is generally preferred.

### `raw` *(string)*
The raw, unparsed string representing the outgoing response message (available after final dispatch).

## Methods

### `send(status: number, reason?: string, opts?: object)`
Dispatches a SIP response back to the network.

- `status` *(number)*: The mandatory SIP response code.
- `reason` *(string)*: Optional. Replaces the default reason phrase mapped to the status code.
- `opts` *(object)*: Optional key-value map.
  - `opts.headers` *(Record<string, string>)*: Headers to inject into the response.
  - `opts.body` *(string)*: A payload string (like SDP).

```typescript
srf.invite((req, res) => {
  res.send(180, 'Ringing'); // Send provisional
  
  setTimeout(() => {
    res.send(200, { body: 'v=0\r\no=-...' }); // Finalize the transaction
  }, 1500);
});
```

### `set(hdr: string | Record<string, string>, value?: string)`
Injects a SIP header onto the response payload before dispatching it.

```typescript
srf.options((req, res) => {
  res.set('Allow', 'INVITE, ACK, OPTIONS, BYE, CANCEL, SUBSCRIBE, NOTIFY, INFO, PUBLISH');
  res.set('Accept', 'application/sdp');
  res.send(200);
});
```

### `get(hdr: string)`
Retrieves a header value currently attached to the `Response`.

### `has(hdr: string)`
Returns `true` if the specific header has been attached to the response.

### `getParsedHeader(hdr: string)`
Retrieves a header from the response and parses it into an object representation.

## Events

### `'end'`
Fired once a *final* response (Status Code >= 200) is successfully routed to the socket stack. Provisional responses (`1xx`) will not trigger this event.

```typescript
res.on('end', ({ status, reason }) => {
  console.log(`Finished processing request, responded with: ${status} ${reason}`);
});
```

### `'finish'`
A more generic lifecycle event indicating the response object has completed all background network operations after dispatch.