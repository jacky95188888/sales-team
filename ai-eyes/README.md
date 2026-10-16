# AI Eyes V3.4.1 test deployment

This branch prepares a separate Cloudflare Worker named `ai-eyes-video-v34-test`.
The production `ai-eyes-video` Worker and `sales-team` Worker are not deployment targets.

Before the manual workflow can run, commit the exact user-reviewed V3.4.1
single-file source as `ai-eyes/worker-v3.4.1.js`. The program pasted in chat
is not currently a file in this repository. Do not substitute V3.1 or V3.3.

The existing `CLOUDFLARE_API_TOKEN` in the protected `production` GitHub
environment read the current AI Eyes secret metadata successfully (HTTP 200).
The current `ai-eyes-video` Worker has secrets named `GEMINI_API_KEY` and
`ACCESS_TOKEN`, but the GitHub production environment did **not** provide
`GEMINI_API_KEY` or `AI_EYES_ACCESS_TOKEN` to the diagnostic job on
2026-10-16. This confirms the exact credential gap for a separate test Worker.
Cloudflare returns the names, not the values, so the existing secret values
cannot be copied out or inferred. A verified Gemini key and a test access
secret must be supplied to GitHub production secrets or provisioned directly
to the new Worker using the user's authenticated account. Never print secret
values in a PR, log, or chat.

Once source and secrets are ready, manually dispatch
`Deploy AI Eyes V3.4.1 test Worker` with input `TEST`. The job checks
syntax, target version and secret presence, deploys the isolated Worker,
and checks `/health`. A health response confirms bindings, not a successful
Google API call; test `/models` and `/text` using the UI after deployment.
