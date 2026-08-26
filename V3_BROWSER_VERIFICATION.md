# CA Solutions OM — V3 Browser Verification

Base: `main`

This V3 verification checkpoint uses the current CA Solutions OM master application already present in the repository.

## Current deployment baseline
- `index.html` — current merged application
- `wingman-client.js` — local Wingman + secure `/api/wingman` fallback
- `api/wingman.js` — server-side OpenAI proxy
- `service-worker.js` — PWA service worker
- `wrangler.jsonc` — Cloudflare Workers assets configuration

## Verification targets
1. App loads in Chrome without a blank/error page.
2. Existing local app functions remain available.
3. Wingman local commands continue to work.
4. Unknown Wingman commands fall back to `/api/wingman` without exposing an API key in the browser.
5. Labour Master / Daily Attendance remain inside the Add Labor workflow.
6. No Work Bills dashboard/menu regression.

This file is a deployment/verification marker only; it does not replace or duplicate application logic.
