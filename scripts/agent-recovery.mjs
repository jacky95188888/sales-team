import { pathToFileURL } from 'node:url';

const BASE = 'https://sales-team.rhtm9y855y.workers.dev';
const ACCOUNT = '22bd6a71b50e9eeaa0daa802615a3459';

// Fixed destinations only. Never print provider responses, headers or credentials.
export async function recover({ env = process.env, request = fetch, now = new Date() } = {}) {
  const report = { checkedAt: now.toISOString(), ai: 'unknown', threads: 'unknown', action: 'none', blockers: [] };
  const call = async (url, options = {}) => request(url, { ...options, signal: AbortSignal.timeout(20000) });
  let health;
  try {
    const response = await call(`${BASE}/health/agent`);
    if (!response.ok) throw new Error('health_unavailable');
    health = await response.json();
    if (health.service !== 'sales-team-agent' || health.ok !== true) throw new Error('health_invalid');
  } catch {
    report.blockers.push('後端健康檢查無法確認；未更改任何設定。');
    return report;
  }
  report.threads = health.threads?.oauthConfigured ? 'credentials_present_not_verified' : 'authorization_required';
  if (!health.threads?.oauthConfigured) report.blockers.push('Threads 尚未保存官方授權，需要帳號本人完成官方連線。');
  if (!health.threads?.livePublishEnabled) report.blockers.push('Threads 正式發布開關關閉；本修復工作不會替你開啟。');
  report.ai = health.anthropic?.configured ? 'configured_not_verified' : 'missing';
  const failed = health.dailyResearch?.errorType === 'anthropic_http_401';
  if (!failed && health.anthropic?.configured) return report;
  const key = String(env.ANTHROPIC_KEY || env.ANTHROPIC_API_KEY || '').trim();
  const cfToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!key) {
    report.ai = failed ? 'authentication_failed' : 'missing';
    report.blockers.push('GitHub 未提供備用 ANTHROPIC_KEY 或 ANTHROPIC_API_KEY；不能憑空修復金鑰。');
    return report;
  }
  // Models GET validates authentication without generating paid content.
  try {
    const validation = await call('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    });
    if (!validation.ok) {
      report.ai = 'backup_rejected';
      report.blockers.push(`備用 AI 金鑰未通過驗證（HTTP ${validation.status}）；未覆蓋 Cloudflare。`);
      return report;
    }
    const data = await validation.json();
    if (!Array.isArray(data.data) || !data.data.length) throw new Error('invalid_models_response');
    report.ai = 'backup_auth_verified';
  } catch {
    report.blockers.push('無法確認備用 AI 金鑰有效；未覆蓋 Cloudflare。');
    return report;
  }
  if (!cfToken) {
    report.blockers.push('GitHub 未提供 CLOUDFLARE_API_TOKEN，無法代替後台寫入設定。');
    return report;
  }
  if (env.RECOVERY_APPLY !== 'true') {
    report.action = 'ready_to_sync';
    report.blockers.push('目前只診斷；可在 GitHub 執行修復工作以同步已驗證的金鑰。');
    return report;
  }
  try {
    // Publisher tokens can fall back to encryption with ANTHROPIC_KEY. Do not
    // rotate it unless an independent publisher encryption secret is present.
    const metadata = await call(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/sales-team/secrets`, {
      headers: { Authorization: `Bearer ${cfToken}` }
    });
    const bindings = await metadata.json();
    if (!metadata.ok || bindings.success !== true || !Array.isArray(bindings.result)) throw new Error('secret_metadata_unavailable');
    if (!bindings.result.some(x => ['PUBLISH_TOKEN_KEY', 'YOUTUBE_CLIENT_SECRET'].includes(x.name))) {
      report.action = 'encryption_dependency_blocked';
      report.blockers.push('影片授權可能使用 AI 金鑰加密；未確認獨立的加密設定，因此不自動更換金鑰。');
      return report;
    }
    const synced = await call(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/sales-team/secrets`, {
      method: 'PUT', headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ANTHROPIC_KEY', text: key, type: 'secret_text' })
    });
    const data = await synced.json();
    if (!synced.ok || data.success !== true) throw new Error('secret_sync_failed');
    report.action = 'ai_secret_synced';
    report.ai = 'synced_research_not_verified';
    report.blockers.push('已同步有效金鑰；需下一次研究成功才能確認完整流程恢復。本工作未觸發研究或發布。');
  } catch {
    report.action = 'sync_failed_or_unknown';
    report.blockers.push('Cloudflare 未確認同步成功；不自動重試寫入，需檢查權限或後台結果。');
  }
  return report;
}

export function summary(report) {
  return ['## 顧問團代理修復結果', '', `檢查時間：${report.checkedAt}`, `AI：${report.ai}`, `Threads：${report.threads}`, `執行：${report.action}`, '', ...report.blockers.map(x => `- ${x}`), '', '此工作只處理 AI 憑證修復；不修改 PIN、不產片、不發布貼文。'].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { appendFileSync } = await import('node:fs');
  const report = await recover();
  const text = summary(report);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  if (['authentication_failed', 'missing', 'backup_rejected', 'backup_auth_verified', 'unknown'].includes(report.ai) && report.action !== 'ready_to_sync' || ['sync_failed_or_unknown', 'encryption_dependency_blocked'].includes(report.action)) process.exitCode = 1;
}
