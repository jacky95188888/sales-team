# AI Eyes V3.4.1 test deployment

## Staging status (2026-10-16)

The isolated candidate Worker is deployed at
https://ai-eyes-video-v34-test.rhtm9y855y.workers.dev/ .
The verified staging run is
https://github.com/jacky95188888/sales-team/actions/runs/38895849283 .
Its UI and health route respond successfully. The read-only diagnostic run
https://github.com/jacky95188888/sales-team/actions/runs/38895768129
reports both GEMINI_API_KEY and ACCESS_TOKEN as false for the test Worker.
The production AI Eyes V3.3 remains deployed and retains its own bindings.

To enable live API tests, open Cloudflare Workers & Pages > ai-eyes-video-v34-test
> Settings > Variables and Secrets > Add. Add GEMINI_API_KEY and ACCESS_TOKEN
as encrypted Secrets to **the test Worker only**. A known valid Gemini API key
may be reused, or a distinct key can be created in Google AI Studio.
Do not place either value in git, chat, or Actions logs. Confirm /health
reports both bindings true, then use ① /models and ② /text with the test
ACCESS_TOKEN. A 200 /health by itself does not prove a Google call succeeds.
Google documents gemini-3.8-flash as a stable video-input model. This does not establish whether this account, region, or key can actually call it; only the live /models, /text, then a controlled video test can do that.

The staging Worker currently contains the V3.4.1-compatible reconstructed
candidate described above. Replace it with the complete original code before
calling it the exact V3.4.1 release.


This branch prepares a separate Cloudflare Worker named `ai-eyes-video-v34-test`.
The production `ai-eyes-video` Worker and `sales-team` Worker are not deployment targets.

The branch contains `ai-eyes/worker-v3.4.1.js`, a V3.4.1-compatible test
implementation reconstructed from the program pasted in chat. It is **not a
byte-for-byte copy** of that full program. It preserves the Interactions
background flow, routes, privacy modes, guarded retries and PWA shell, while
simplifying the mobile report rendering, timestamp checks, and local
verification persistence. Review those differences before treating this as
the original V3.4.1 release. The branch includes mock route smoke tests; no
live Google video analysis has been run with this test build.

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
