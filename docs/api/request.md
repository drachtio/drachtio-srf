# Request

The `Request` object represents an incoming (or outgoing) SIP Request. It provides methods to inspect the headers, URI, method, and body. It is typically passed as the first parameter to any route-level middleware in `Srf`.

## Properties

### `method` *(string)*
The SIP Method (e.g. `INVITE`, `OPTIONS`).

### `uri` *(string)*
The Request-URI (e.g. `sip:alice@domain.com`).

### `body` *(string)*
The raw payload of the Request (commonly SDP, or JSON data).

### `headers` *(Record<string, string>)*
A map of the raw SIP headers parsed from the transport. Accessing them using `.get(hdr)` is preferred due to case insensitivity.

### `raw` *(string)*
The raw network transmission payload.

### `callingNumber` *(string)*
A convenience getter for the user part of the `From` (or `P-Asserted-Identity`) URI.

### `callingName` *(string)*
A convenience getter for the display name attached to the `From` header.

### `calledNumber` *(string)*
A convenience getter for the user part of the `To` URI.

### `canFormDialog` *(boolean)*
`true` if the SIP method is capable of forming a dialog (e.g., `INVITE`, `SUBSCRIBE`) and the message doesn't have a `To` tag.

## Methods

### `get(hdr: string): string | undefined`
Retrieves the string value of a specific SIP header, ignoring case.
```typescript
const contentType = req.get('content-type');
```

### `has(hdr: string): boolean`
Returns `true` if the Request contains the specified header.

### `set(hdr: string | Record<string, string>, value?: string): this`
Modifies the Request object to update or set a new header. Useful if proxying the request to a downstream host where the Request object will act as an outgoing UAC transmission.

```typescript
// Rewrite the routing header
req.set('Route', '<sip:proxy.example.com;lr>');
```

### `getParsedHeader(hdr: string): any`
Parses the header value into an object representation. Extremely useful for interrogating URIs and extracting key-value tags.
```typescript
const from = req.getParsedHeader('From');
console.log(from.uri); // e.g. sip:alice@example.com
console.log(from.params.tag); // e.g. x89v10z
```

### `proxy(opts: ProxyRequestOptions): Promise<any>`
Proxies the incoming request to a specific downstream destination. Returns a `Promise` resolving to the final result of the operation.
```typescript
const result = await req.proxy({
  destination: 'sip:somebody@example.com',
  recordRoute: true
});
```

### `cancel(opts?: any, callback?: any)`
Cancels an outbound Request (must be a UAC request) before it establishes a dialog, typically aborting an outstanding `INVITE`.

## Events

While primarily an interrogatable object, `Request` can emit:
- `'response'`: Fired when a provisional or final response is received (for outbound requests).
- `'cancel'`: Fired when the network detects an inbound `CANCEL` targeted at this specific Request's transaction ID.
- `'update'`: Fired when the request is updated in-flight.
- `'authenticate'`: Fired when the request encounters a 401/407 authentication challenge.