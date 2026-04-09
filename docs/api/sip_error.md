# SipError

The `SipError` object is an exception class extending the native JavaScript `Error`. 

It is designed to specifically represent unexpected non-success network responses (usually HTTP/SIP responses carrying a status code like `4xx`, `5xx`, or `6xx`) rather than generic application crashes. Methods such as `srf.createUAC` typically reject their promises with a `SipError` if they receive a non-200 final status response.

## Properties

### `status` *(number)*
The numeric SIP error code that caused the rejection (e.g., `480`, `503`, `603`).

### `reason` *(string)*
An optional, parsed reason phrase detailing why the response failed (e.g., `Temporarily Unavailable`, `Service Unavailable`, `Decline`).

### `res` *(Response)*
An optional property referencing the actual SIP message that triggered the exception. By inspecting `err.res.headers`, you can pull debug headers like `X-Reason` from the remote server that caused the error.

## Example

```typescript
srf.invite(async (req, res) => {
  try {
    const dialog = await srf.createUAC('sip:unknown-user@example.com');
  } catch (err) {
    if (err.name === 'SipError') {
      console.log(`Call failed with status ${err.status}: ${err.reason}`);
      
      // We can inspect the failing response headers if needed!
      if (err.res && err.res.has('Retry-After')) {
         console.log(`Server requested a delay of ${err.res.get('Retry-After')} seconds.`);
      }
      
      res.send(err.status, err.reason);
    } else {
      console.error('Unknown exception occurred:', err);
      res.send(500);
    }
  }
});