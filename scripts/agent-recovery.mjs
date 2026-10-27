import { pathToFileURL } from 'node:url';

const BASE = 'https://sales-team.rhtm9y855y.workers.dev';
const ACCOUNT = '22bd6a71b50e9eeaa0daa802615a3459';

// Fixed destinations only. Never print provider responses, headers or credentials.
export async function recover({ env = process.env, request = fetch, now = new Date() } = {}) {
  const report = {
    checkedAt: now.toISOString(),
    research: { date: null, status: 'unknown', draftCount: null, lastUpdatedAt: null, errorType: null, providerErrorType: null, providerErrorCode: null },
    ai: 'unknown', threads: 'unknown', cloudflare: 'unknown', aiBindings: [], action: 'none', blockers: []
  };
  const call = async (url, options = {}) => request(url, { ...options, signal: AbortSignal.timeout(20000) });
  let health;
  try {
    const response = await call(`${BASE}/health/agent`);
    if (!response.ok) throw new Error('health_unavailable');
    health = await response.json();
    if (health.service !== 'sales-team-agent' || health.ok !== true) throw new Error('health_invalid');

    // Copy only bounded, non-secret readiness fields from the public read-only health endpoint.
    const daily = health.dailyResearch && typeof health.dailyResearch === 'object' ? health.dailyResearch : {};
    const date = String(daily.date ?? '');
    const status = String(daily.status ?? '');
    const errorType = String(daily.errorType ?? '');
    const providerType = String(daily.providerErrorType ?? '');
    const providerCode = String(daily.providerErrorCode ?? '');
    const stamp = Number(daily.lastUpdatedAt);
    report.research = {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      status: ['failed', 'waiting_review', 'researching', 'not_recorded', 'unavailable', 'diagnostics_unavailable'].includes(status) ? status : 'unknown',
      draftCount: Number.isInteger(daily.draftCount) && daily.draftCount >= 0 && daily.draftCount <= 1000 ? daily.draftCount : null,
      lastUpdatedAt: Number.isFinite(stamp) && stamp > 0 && stamp <= 8640000000000000 ? new Date(stamp).toISOString() : null,
      errorType: /^(anthropic_http_[1-5]\d{2}|no_candidates|research_failed)$/.test(errorType) ? errorType : null,
      providerErrorType: /^[A-Za-z0-9_.-]{1,80}$/.test(providerType) ? providerType : null,
      providerErrorCode: /^[A-Za-z0-9_.-]{1,80}$/.test(providerCode) ? providerCode : null
    };
  } catch {
    report.blockers.push('後端健康檢查無法確認；未更改任何設定。');
    return report;
  }
  report.threads = health.threads?.oauthConfigured ? 'credentials_present_not_verified' : 'authorization_required';
  if (!health.threads?.oauthConfigured) report.blockers.push('Threads 尚未保存官方授權，需要帳號本人完成官方連線。');
  if (!health.threads?.livePublishEnabled) report.blockers.push('Threads 正式發布開關關閉；本修復工作不會替你開啟。');
  report.ai = health.anthropic?.configured ? 'configured_not_verified' : 'missing';
  const failed = report.research.errorType === 'anthropic_http_401';
  if (report.research.status === 'failed' && !failed) {
    report.blockers.push(`每日研究失敗（${report.research.errorType || '未分類'}）；本修復流程只對 HTTP 401 嘗試憑證修復，不猜測或覆蓋其他設定。`);
  } else if (['not_recorded', 'unavailable', 'diagnostics_unavailable'].includes(report.research.status)) {
    report.blockers.push('目前沒有可核對的今日研究紀錄；本修復流程不會手動觸發研究或發布。');
  }
  const cfToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  let secretNames = null;
  if (cfToken) {
    try {
      const response = await call(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/sales-team/secrets`, {
        headers: { Authorization: `Bearer ${cfToken}` }
      });
      const data = await response.json();
      if (!response.ok || data.success !== true || !Array.isArray(data.result)) throw new Error('metadata_unavailable');
      secretNames = data.result.map(x => x.name);
      report.cloudflare = 'worker_access_verified';
      report.aiBindings = secretNames.filter(x => ['ANTHROPIC_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'].includes(x));
    } catch { report.cloudflare = 'worker_access_unverified'; }
  } else report.cloudflare = 'credential_missing';
  if (!failed && health.anthropic?.configured) return report;
  const key = String(env.ANTHROPIC_KEY || env.ANTHROPIC_API_KEY || '').trim();
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
    if (!secretNames) throw new Error('secret_metadata_unavailable');
    if (!secretNames.some(x => ['PUBLISH_TOKEN_KEY', 'YOUTUBE_CLIENT_SECRET'].includes(x))) {
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
  const research = report.research || {};
  return [
    '## 顧問團代理修復結果',
    '',
    `檢查時間：${report.checkedAt}`,
    `每日研究：${research.status || 'unknown'}（日期：${research.date || '未提供'}；待審草稿：${research.draftCount ?? '未提供'} 篇）`,
    `研究最後更新：${research.lastUpdatedAt || '未提供'}`,
    `研究錯誤分類：${research.errorType || '無'}`,
    `Anthropic 錯誤代碼（安全欄位）：type=${research.providerErrorType || '未提供'}；code=${research.providerErrorCode || '未提供'}`,
    `AI：${report.ai}`,
    `Cloudflare：${report.cloudflare}`,
    `已保存 AI 設定名稱：${report.aiBindings.join('、') || '未確認'}`,
    `Threads：${report.threads}`,
    `執行：${report.action}`,
    '',
    ...report.blockers.map(x => `- ${x}`),
    '',
    '此工作只讀取健康摘要並處理已驗證的 AI 憑證；不修改 PIN、不觸發研究、不產片、不發布貼文。'
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { appendFileSync } = await import('node:fs');
  const report = await recover();
  const text = summary(report);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  const researchNeedsAttention = ['failed', 'not_recorded', 'unavailable', 'diagnostics_unavailable'].includes(report.research?.status);
  if ((['authentication_failed', 'missing', 'backup_rejected', 'backup_auth_verified', 'unknown'].includes(report.ai) && report.action !== 'ready_to_sync') || ['sync_failed_or_unknown', 'encryption_dependency_blocked'].includes(report.action) || researchNeedsAttention) process.exitCode = 1;
}
