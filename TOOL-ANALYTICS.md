# Cross-tool page-view analytics — 2026-10-16

Scope: fraud-lab, sales-team, n7k2-jl9x, dream-library, expert-council, tool. Tianheng keeps its existing Firebase totals and funnel. The unpublished storage-cabinet tool remains pending. Fraud Lab keeps its pre-existing analytics separately; new cross-tool counts do not merge historical records.

The command center retains its green/gold visual system. A separate dashboard uses the same color, border, spacing and typography tokens, with keyboard focus, 44px controls and horizontally scrollable daily charts. Existing product scripts and layouts are preserved; public pages only add one deferred tracker. Existing admin pages gain a statistics link; tools without admin pages receive an analytics redirect entry.

Only visible top-level public document loads count. Management, analytics, previews, demos, test pages and WebDriver browsers are excluded. No persistent visitor ID, IP, query string, form content or account identifier is stored. Metrics count page views, not unique people. Taipei dates apply.

Storage: existing MONITOR KV, isolated `toolviews:v1:` prefix. One immutable record per page load UUID prevents concurrent increments from overwriting each other. Read API exposes aggregate counts and public page paths only. KV is eventually consistent; allow at least 60 seconds for new records to appear. Source is not cryptographic proof against fabricated client traffic. This lightweight implementation lists record metadata and returns an explicit error beyond 50,000 records for a tool; migrate to an atomic aggregate store before reaching that limit. Records have no expiry so cumulative figures remain cumulative.

Checks: five backend tests passed (concurrent writes, replay deduplication, pagination, tool isolation, absent storage, invalid requests, browser origin-only referrer). Existing worker safety checks passed. HTML parser verified all existing public script blocks are unchanged and each public page adds exactly one tracker. Production dashboards for all six tools loaded successfully through the browser. Live automated browser visits are intentionally excluded, so a real visitor write has not yet been verified. Desktop screenshot reviewed. Automated 390/414/430px checks could not run because the environment browser download failed; do not claim mobile visual QA passed.

Entry: https://jacky95188888.github.io/-/admin.html
Dashboard: https://jacky95188888.github.io/-/analytics.html?tool=sales-team
