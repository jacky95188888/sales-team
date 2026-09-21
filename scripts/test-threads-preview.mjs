import assert from "node:assert/strict";
import { threadsPreviewPost } from "../threads-service-v1.js";

const result = threadsPreviewPost({ topic: "AI 自動化", hookType: "反常識", text: "這是一篇只做預覽、不會發布的 Threads 文字。" });
assert.equal(result.preview.platform, "threads");
assert.equal(result.preview.format, "text");
assert.equal(result.safe.publicPostCreated, false);
assert.equal(result.safe.threadsApiCalled, false);
assert.throws(() => threadsPreviewPost({ text: "" }), /THREADS_TEXT_REQUIRED/);

console.log("Threads publish preview safety test passed.");
