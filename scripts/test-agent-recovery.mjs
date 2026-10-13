import assert from 'node:assert/strict';
import { recover, summary } from './agent-recovery.mjs';

const health = { ok: true, service: 'sales-team-agent', anthropic: { configured: true }, threads: { oauthConfigured: false, livePublishEnabled: false }, dailyResearch: { errorType: 'anthropic_http_401' } };
function mock({ valid = true, cloudflare = true, healthy = false, networkFail = false, encryptionSafe = true } = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (networkFail) throw new Error('failure including secret-do-not-log');
    if (url.includes('/health/agent')) return Response.json(healthy ? { ...health, dailyResearch: {} } : health);
    if (url.includes('api.anthropic.com')) return Response.json(valid ? { data: [{ id: 'model' }] } : { error: 'secret-do-not-log' }, { status: valid ? 200 : 401 });
    if (url.includes('api.cloudflare.com')) return options.method === 'PUT'
      ? Response.json({ success: cloudflare, errors: [{ message: 'secret-do-not-log' }] }, { status: cloudflare ? 200 : 403 })
      : Response.json({ success: true, result: encryptionSafe ? [{ name: 'YOUTUBE_CLIENT_SECRET' }] : [{ name: 'ANTHROPIC_KEY' }] });
    throw new Error('unexpected destination');
  };
  return { calls, request };
}
const env = { ANTHROPIC_KEY: 'secret-do-not-log', CLOUDFLARE_API_TOKEN: 'cf-do-not-log', RECOVERY_APPLY: 'true' };
let m = mock(), r = await recover({ env: {}, request: m.request });
assert.equal(r.ai, 'authentication_failed'); assert.equal(m.calls.length, 1);
m = mock({ valid: false }); r = await recover({ env, request: m.request });
assert.equal(r.ai, 'backup_rejected'); assert.equal(m.calls.length, 2);
m = mock(); r = await recover({ env: { ...env, RECOVERY_APPLY: 'false' }, request: m.request });
assert.equal(r.action, 'ready_to_sync'); assert.equal(m.calls.length, 2);
m = mock(); r = await recover({ env, request: m.request });
assert.equal(r.action, 'ai_secret_synced'); assert.equal(r.ai, 'synced_research_not_verified');
assert.equal(m.calls.length, 4); assert.equal(JSON.parse(m.calls[3].options.body).name, 'ANTHROPIC_KEY');
assert.ok(!m.calls.some(c => /research-now|publish|approve|oauth-start/.test(c.url)));
assert.ok(!summary(r).includes(env.ANTHROPIC_KEY)); assert.ok(!summary(r).includes(env.CLOUDFLARE_API_TOKEN));
m = mock({ cloudflare: false }); r = await recover({ env, request: m.request });
assert.equal(r.action, 'sync_failed_or_unknown'); assert.ok(!summary(r).includes('secret-do-not-log'));
m = mock({ healthy: true }); await recover({ env, request: m.request }); assert.equal(m.calls.length, 1);
m = mock({ networkFail: true }); r = await recover({ env, request: m.request });
assert.equal(r.ai, 'unknown'); assert.ok(!summary(r).includes('secret-do-not-log'));
m = mock({ encryptionSafe: false }); r = await recover({ env, request: m.request });
assert.equal(r.action, 'encryption_dependency_blocked'); assert.ok(!m.calls.some(x => x.options.method === 'PUT'));
m = mock(); r = await recover({ env: { ANTHROPIC_KEY: env.ANTHROPIC_KEY, RECOVERY_APPLY: 'true' }, request: m.request });
assert.equal(r.action, 'none'); assert.equal(m.calls.length, 2);
console.log('Agent recovery: 9 scenarios passed.');
