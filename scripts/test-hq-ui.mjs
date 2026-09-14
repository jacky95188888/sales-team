import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the real rendering/review functions without booting UI or contacting APIs.
const source = readFileSync(new URL('../hq-patch.js', import.meta.url), 'utf8');
const context = {
  window: {},
  document: { readyState: 'loading', addEventListener() {} },
  callAPI: async () => ({ pass: true })
};
vm.createContext(context);
vm.runInContext(source.replace('  if (document.readyState === "loading")',
  '  window.testHQ = {displayStateLabel, buttonsHtml, richOutput, taskStage, aiReview};\n  if (document.readyState === "loading")'), context);
const h = context.window.testHQ;
const task = { id: 'fixture', state: 'scheduled', channels: ['video'] };
assert.equal(h.displayStateLabel(task), '已批准・尚未產片');
assert.match(h.taskStage(task).work, /尚未啟動/);
assert.doesNotMatch(h.buttonsHtml(task), /data-hq-done/);
task.videoJobs = { video: { status: 'processing' } };
assert.equal(h.displayStateLabel(task), '已批准・產片中');
task.videoJobs.video.status = 'failed';
assert.equal(h.displayStateLabel(task), '產片失敗・需處理');
task.videoJobs.video = { status: 'completed', videoUrl: 'https://example.com/test.mp4' };
assert.equal(h.displayStateLabel(task), '成品待驗收');
assert.match(h.buttonsHtml(task), /data-hq-finalapprove/);
assert.match(h.taskStage(task).work, /播放驗收/);
task.finalApprovedAt = 1;
assert.equal(h.displayStateLabel(task), '已驗收・等待發布');
assert.doesNotMatch(h.richOutput('<script>alert(1)</script>'), /<script>/);
assert.match(h.richOutput('## 標題\n**重點**'), /<h4>標題<\/h4>/);
const review = await h.aiReview(task, { video: '只有一句旁白，沒有分鏡。' });
assert.equal(review.pass, false, 'AI pass must not bypass local storyboard checks');
assert.ok(review.flags.length > 0);
console.log('HQ UI regression tests passed (13 assertions, mocked API; no paid generation).');
