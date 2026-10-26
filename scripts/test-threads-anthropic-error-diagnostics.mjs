import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Load the exact Worker helper as ESM without changing repository module settings.
const source = await readFile(new URL("../threads-growth.js", import.meta.url), "utf8");
const { discoverThreadsTopics, summarizeAnthropicError } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const secret = "sk-ant-test-secret-value";
const endpoint = "https://api.anthropic.com/v1/messages";

async function withMockFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

function discovery() {
  return discoverThreadsTopics({ ANTHROPIC_KEY: secret }, {});
}

test("Anthropic errors retain safe diagnostic details without exposing credentials", async (t) => {
  await t.test("preserves HTTP 401 type, code and request id while redacting the key", async () => {
    await withMockFetch(async (url, options) => {
      assert.equal(String(url), endpoint);
      assert.equal(options.headers["x-api-key"], secret);
      return new Response(JSON.stringify({
        type: "error",
        error: {
          type: "authentication_error",
          code: "invalid_api_key",
          message: `Invalid API key: ${secret}`,
        },
      }), {
        status: 401,
        headers: { "content-type": "application/json", "request-id": "req_test_401" },
      });
    }, async () => {
      await assert.rejects(discovery(), (error) => {
        assert.match(error.message, /Anthropic 401/);
        assert.match(error.message, /type=authentication_error/);
        assert.match(error.message, /code=invalid_api_key/);
        assert.match(error.message, /request_id=req_test_401/);
        assert.match(error.message, /\[REDACTED\]/);
        assert.doesNotMatch(error.message, /sk-ant-test-secret-value/);
        return true;
      });
    });
  });

  await t.test("handles non-JSON upstream errors without leaking key text", async () => {
    await withMockFetch(async () => new Response(
      `<html><body>Unauthorized key ${secret}</body></html>`,
      { status: 401, headers: { "content-type": "text/html" } },
    ), async () => {
      await assert.rejects(discovery(), (error) => {
        assert.match(error.message, /Anthropic 401/);
        assert.match(error.message, /Unauthorized key \[REDACTED\]/);
        assert.doesNotMatch(error.message, /sk-ant-test-secret-value/);
        return true;
      });
    });
  });

  await t.test("keeps safe permission-error messages useful", async () => {
    await withMockFetch(async () => new Response(JSON.stringify({
      error: {
        type: "permission_error",
        code: "not_allowed",
        message: "This API key is not authorized for the requested operation",
      },
    }), { status: 403, headers: { "content-type": "application/json" } }), async () => {
      await assert.rejects(discovery(), (error) => {
        assert.match(error.message, /Anthropic 403/);
        assert.match(error.message, /type=permission_error/);
        assert.match(error.message, /This API key is not authorized/);
        return true;
      });
    });
  });

  await t.test("preserves normal successful response parsing", async () => {
    await withMockFetch(async (url, options) => {
      assert.equal(String(url), endpoint);
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, "claude-sonnet-4-6");
      assert.equal(payload.tools[0].type, "web_search_20250305");
      return new Response(JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({
          candidates: [{ topic: "可核對題目", priority: 1, decision: "值得寫" }],
        }) }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }, async () => {
      const result = await discovery();
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].topic, "可核對題目");
    });
  });
  await t.test("public health summary exposes only allowlisted provider metadata", async () => {
    const details = summarizeAnthropicError(
      "Anthropic 401 | type=authentication_error | code=invalid_api_key | message=Invalid API key: [REDACTED] | request_id=req_test_401",
    );
    assert.deepEqual(details, {
      httpStatus: 401,
      providerType: "authentication_error",
      providerCode: "invalid_api_key",
    });
    assert.deepEqual(summarizeAnthropicError("Anthropic 401"), {
      httpStatus: 401,
      providerType: null,
      providerCode: null,
    });
    assert.equal(Object.hasOwn(details, "message"), false);
    assert.equal(Object.hasOwn(details, "requestId"), false);
  });

});
