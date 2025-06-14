# Server Middleware

This directory contains various middleware functions used in the application.

## Request Timing Middleware

The `requestTimingMiddleware.ts` file contains functionality that logs timing information for all API requests. This helps with performance monitoring and debugging slow endpoints.

### Features

- Times all API requests (paths starting with `/api`)
- Logs the method, path, status code, and response time
- Color codes response times for quick visual identification:
  - **Green (⚡)**: Fast responses (< 500ms)
  - **Cyan (⏳)**: Medium responses (500ms - 1000ms)
  - **Yellow (⏱️)**: Slow responses (1000ms - 2000ms)
  - **Red (🐢)**: Very slow responses (> 2000ms)
- For POST/PUT/PATCH requests, includes a summary of the request payload
- Ignores non-API routes to reduce noise in logs

### Example Log Output

```
⚡ [API Timing] GET /api/users completed in 48.12ms with status 200
🐢 [API Timing] POST /api/tweets with payload: {tweetId, password, cursor} -> 200 in 2345.67ms
```

## Cache Middleware

The `cacheMiddleware.ts` file contains functionality that adds cache control headers to static assets and API responses.

## Cache Busting Middleware

The `cacheBust.ts` middleware ensures that clients always get the latest version of HTML responses by adding cache-busting parameters.