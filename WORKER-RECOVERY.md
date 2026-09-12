# Sales Team Worker recovery

This repository contains the recovered source for the deployed `sales-team`
Cloudflare Worker.

## Deployment inputs

- Entry point: `sales-team-worker.js`
- Configuration: `wrangler.jsonc`
- KV binding: `MONITOR`
- Scheduled trigger: `0 0 * * *`
- Required secret: `ANTHROPIC_KEY`
- Optional push secrets: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`

Never commit secret values. Add them with Wrangler's secret command or through
Cloudflare's secret-variable UI. In particular, `ANTHROPIC_KEY` must be stored
as a secret binding rather than a plain-text variable.

## Safe deployment sequence

1. Rotate the Anthropic API key that was previously stored as plain text.
2. Save the replacement as the Worker's `ANTHROPIC_KEY` secret.
3. Run `npx wrangler deploy --config wrangler.jsonc` from a clean checkout.
4. Confirm `/monitor-notes` responds and test one POST route from the production
   site before enabling automated deployment.

The recovered source was syntax-checked before it was added to the repository.
