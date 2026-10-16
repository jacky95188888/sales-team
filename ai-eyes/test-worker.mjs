import assert from 'node:assert/strict';
import worker from './worker-v3.4.1.js';

const env = { ACCESS_TOKEN: 'test-password-123', GEMINI_API_KEY: 'test-api-key-123', GEMINI_MODEL: 'gemini-3.8-flash' };
const call = (path, data, auth = true) => worker.fetch(new Request('https://test.example' + path, {
  method: data ? 'POST' : 'GET',
  headers: data ? { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer test-password-123' } : {}) } : {},
  body: data ? JSON.stringify(data) : undefined
}), env);

let res = await call('/health');
assert.equal((await res.json()).version, 'AI Eyes V3.4.1');
res = await call('/text', {}, false);
assert.equal(res.status, 401);

globalThis.fetch = async (_, opts) => {
  if (opts.body?.includes('background')) return new Response(JSON.stringify({ id: 'v1_test123', status: 'queued' }), { status: 200 });
  if (opts.method === 'GET') return new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: '可核對報告' }] }] }), { status: 200 });
  return new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'User location is not supported for the API use.' } }), { status: 400 });
};
res = await call('/text', {});
assert.equal(res.status, 400);
assert.equal((await res.json()).upstreamStatus, 400);
res = await call('/analyze', { sample: true, mode: 'background' });
assert.equal((await res.json()).id, 'v1_test123');
res = await call('/result', { id: 'v1_test123' });
assert.equal((await res.json()).text, '可核對報告');
console.log('AI Eyes local route smoke tests passed');
