# AI Eyes V3.4.1 test deployment

This branch prepares a separate Cloudflare Worker named `ai-eyes-video-v34-test`.
The production `ai-eyes-video` Worker and `sales-team` Worker are not deployment targets.

Before the manual workflow can run, commit the exact user-reviewed V3.4.1
single-file source as `ai-eyes/worker-v3.4.1.js`. The program pasted in chat
is not currently a file in this repository. Do not substitute V3.1 or V3.3.

The workflow uses the existing `CLOUDFLARE_API_TOKEN` from the protected
`production` GitHub environment. It requires separately available GitHub
secrets `GEMINI_API_KEY` and `AI_EYES_ACCESS_TOKEN`; their presence has not
been verified. Existing Cloudflare Worker secrets cannot be read back or
implicitly copied to a new Worker. Add verified values securely if absent,
without printing them in a PR, log, or chat.

Once source and secrets are ready, manually dispatch
`Deploy AI Eyes V3.4.1 test Worker` with input `TEST`. The job checks
syntax, target version and secret presence, deploys the isolated Worker,
and checks `/health`. A health response confirms bindings, not a successful
Google API call; test `/models` and `/text` using the UI after deployment.
