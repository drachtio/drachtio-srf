# Middleware Routing

`drachtio-srf` provides a routing architecture heavily inspired by Express.js. You can bind callback functions (middleware) to specific SIP methods (`INVITE`, `REGISTER`, `OPTIONS`, etc.) or use a generic middleware chain that processes every incoming message before falling down the routing path.

## General Middleware (`use`)

You can intercept all incoming SIP requests using `srf.use`. This is useful for global tasks like logging, authentication, or parsing common headers across the entire application.

```typescript
// Applies to all incoming SIP Requests
srf.use((req, res, next) => {
  console.log(`Received incoming request: ${req.method} from ${req.callingNumber}`);
  next(); // Pass control to the next middleware or specific route handler
});
```

You can also restrict middleware to a specific SIP method directly via `use(method, ...)` if desired, though using explicit method handlers (e.g. `srf.invite`) is generally preferred.

## Method-Specific Routing

The framework defines helper methods directly on the `Srf` instance for standard SIP Request methods.

These functions take a callback with `(req: Request, res: Response, next: Function)`.

```typescript
srf.invite((req, res, next) => {
  // Handle an incoming INVITE
  if (!req.has('Contact')) {
    res.send(400, 'Bad Request - Missing Contact Header');
    return;
  }
  next(); // Could be passed to another handler for INVITEs
});

srf.register((req, res) => {
  // Handle a device registration
  res.send(200, {
    headers: {
      'Contact': req.get('Contact'),
      'Expires': req.get('Expires') || '3600'
    }
  });
});
```

## Chaining

Like Express, multiple functions can be chained together to form a processing pipeline. If `next()` is called, the message propagates to the subsequent function. If `next()` is omitted (and a response is returned directly), execution stops at that layer.

```typescript
function requireAuthentication(req, res, next) {
  const auth = req.get('Authorization');
  if (!auth) {
    res.send(401, 'Unauthorized');
    return;
  }
  // (Perform real auth check here...)
  next();
}

// Chain the generic authenticator to only protect INVITE endpoints
srf.invite(requireAuthentication, async (req, res) => {
  const dialog = await srf.createUAS(req, res, { localSdp: mySdp });
});
```

This simple, intuitive architecture scales remarkably well whether you're building simple routing scripts or robust B2BUA platforms.