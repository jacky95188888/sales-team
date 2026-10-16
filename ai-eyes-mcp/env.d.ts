declare namespace Cloudflare {
  interface Env {
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace<import("./src/index").AiEyesMCP>;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
    AI_EYES_ACCESS_TOKEN: string;
    AI_EYES_BASE_URL?: string;
    ALLOWED_GITHUB_LOGIN: string;
  }
}
interface Env extends Cloudflare.Env {}
