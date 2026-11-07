import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Import the exact production helper as ESM without changing repository module settings.
const source = await readFile(new URL("../threads-growth.js", import.meta.url), "utf8");
const { draftThreadsPost, validateThreadsDraft } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const valid = {
  hooks: ["先說一個實際問題", "我後來改了做法", "這件事值得重新想想"],
  selected: 1,
  reason: "最符合文章內容",
  post: "這是一篇完整的 Threads 草稿。",
  topicTag: "AI實作",
  hookType: "經驗分享",
};

assert.deepEqual(validateThreadsDraft(valid), valid);
assert.throws(() => validateThreadsDraft(null), /THREADS_DRAFT_INVALID_JSON/);
assert.throws(
  () => validateThreadsDraft({ ...valid, hooks: ["只有一個", "第二個"] }),
  /THREADS_DRAFT_INVALID_HOOKS/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, hooks: ["重複鉤子", "重複鉤子", "第三個"] }),
  /THREADS_DRAFT_INVALID_HOOKS/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, hooks: ["", "第二個", "第三個"] }),
  /THREADS_DRAFT_INVALID_HOOKS/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, selected: 3 }),
  /THREADS_DRAFT_INVALID_SELECTION/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, selected: "1" }),
  /THREADS_DRAFT_INVALID_SELECTION/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, post: "   " }),
  /THREADS_DRAFT_INVALID_POST/,
);
assert.throws(
  () => validateThreadsDraft({ ...valid, post: "x".repeat(5001) }),
  /THREADS_DRAFT_INVALID_POST/,
);

async function withMockFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

const secret = "sk-ant-test-secret-value";
await withMockFetch(async (url, options) => {
  assert.equal(String(url), "https://api.anthropic.com/v1/messages");
  assert.equal(options.headers["x-api-key"], secret);
  return new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(valid) }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}, async () => {
  const result = await draftThreadsPost({ ANTHROPIC_KEY: secret }, { topic: "測試題目" });
  assert.equal(result.hooks.length, 3);
  assert.equal(result.selected, 1);
  assert.equal(result.post, valid.post);
});

await withMockFetch(async () => new Response(JSON.stringify({
  content: [{ type: "text", text: JSON.stringify({ ...valid, hooks: ["同一鉤子", "同一鉤子", "第三個"] }) }],
}), { status: 200, headers: { "content-type": "application/json" } }), async () => {
  await assert.rejects(
    draftThreadsPost({ ANTHROPIC_KEY: secret }, { topic: "測試題目" }),
    /THREADS_DRAFT_INVALID_HOOKS/,
  );
});

await withMockFetch(async () => new Response(JSON.stringify({
  content: [{ type: "text", text: "不是 JSON" }],
}), { status: 200, headers: { "content-type": "application/json" } }), async () => {
  await assert.rejects(
    draftThreadsPost({ ANTHROPIC_KEY: secret }, { topic: "測試題目" }),
    /THREADS_DRAFT_INVALID_JSON/,
  );
});

console.log("Threads draft schema validation passed (11 assertions plus 3 mocked API paths).");
