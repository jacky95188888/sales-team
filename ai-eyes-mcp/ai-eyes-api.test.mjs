import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYouTubeUrl, aiEyesCall } from './src/ai-eyes-api.ts';

test('accepts only an exact YouTube host and preserves video ID', () => {
  assert.equal(normalizeYouTubeUrl('https://youtu.be/DKM94g3Hr_M?si=test'),
    'https://www.youtube.com/watch?v=DKM94g3Hr_M');
  assert.equal(normalizeYouTubeUrl('https://youtube.com/shorts/mLrXolUtOFk'),
    'https://www.youtube.com/watch?v=mLrXolUtOFk');
  assert.throws(() => normalizeYouTubeUrl('https://youtube.com.evil.test/watch?v=DKM94g3Hr_M'));
});

test('passes backend auth only to the allowlisted AI Eyes origin', async () => {
  let calls = 0;
  const env = { AI_EYES_ACCESS_TOKEN: 'test-secret', AI_EYES_BASE_URL: 'https://ai-eyes-video.rhtm9y855y.workers.dev' };
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url.hostname, 'ai-eyes-video.rhtm9y855y.workers.dev');
    assert.equal(options.headers.authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(options.body), { id: 'job-1234' });
    return new Response(JSON.stringify({ ok: true, state: 'complete', text: '00:01 observed' }), { status: 200 });
  };
  const data = await aiEyesCall(env, '/result', { id: 'job-1234' }, fetchImpl);
  assert.equal(calls, 1);
  assert.equal(data.text, '00:01 observed');
  await assert.rejects(() => aiEyesCall({ ...env, AI_EYES_BASE_URL: 'https://evil.test' }, '/result', { id: 'x' }, fetchImpl));
  assert.equal(calls, 1);
});

test('exposes authorization failure without a second paid create attempt', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ ok: false, stage: 'auth', error: { message: 'denied' } }), { status: 401 });
  };
  await assert.rejects(() => aiEyesCall({ AI_EYES_ACCESS_TOKEN: 'wrong' }, '/analyze',
    { videoUrl: 'https://www.youtube.com/watch?v=DKM94g3Hr_M' }, fetchImpl), /HTTP 401/);
  assert.equal(calls, 1);
});
