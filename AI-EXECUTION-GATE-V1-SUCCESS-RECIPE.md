# AI 執行閘門 V1｜成功配方

更新：2026-09-29  
來源專案：sales-team（美女顧問團）  
狀態：已合併 main、Worker Safety Checks 通過、Cloudflare Worker 正式部署通過、GitHub Pages 正式部署通過。

## 目的

讓 AI 可以自動研究、整理與產生草稿，但任何會對外造成副作用的動作，都必須經過人工批准。

標準流程：

研究 → 草稿 → 人工內容審核 → 安全測試 → 人工執行確認 → 正式執行 → 正式環境驗證

## 已驗證的 Threads V1

### 自動區

- 題目研究
- Threads 純文字草稿
- 草稿保存
- 安全 dry-run
- 部署後 smoke test

### 人工批准區

- 讀取審核清單
- 批准／拒絕草稿
- 開啟正式發布
- 正式發布

### 安全規則

1. 受保護路由：config / drafts / approve / publish。
2. 受保護路由沒有 X-Approval-Key 時必須回 401 APPROVAL_UNAUTHORIZED。
3. 原始執行 PIN 不寫入 repo；repo 只保存 SHA-256 雜湊。
4. 手機端原始 PIN 只放 sessionStorage。
5. live publish 預設關閉。
6. Threads 官方 OAuth／Access Token 仍是正式發布的第二道條件。
7. 安全測試不得呼叫 Threads 建立公開貼文。
8. 每次正式 Worker 部署後，自動驗證受保護路由沒有 PIN 時仍然全部被擋住。

## 已驗證檔案

- sales-team-worker.js：Threads growth routes、人工批准、SHA-256 驗證、正式發布。
- threads-approval-console.js：手機版「🛡️ 脆審核」。
- index.html：載入手機審核介面。
- scripts/check-worker.mjs：靜態安全檢查。
- scripts/test-hq-worker.mjs：未授權 401、批准流程、安全 dry-run、live publish 預設封鎖。
- .github/workflows/deploy-worker.yml：正式部署後 production smoke test。

## 複製到其他專案時不要直接照搬的部分

Threads OAuth、Threads API、文字長度與 publish endpoint 都是 sales-team 專用。其他專案只複製「執行閘門」概念與測試規則。

## 下一個專案的最小模板

1. 定義哪些動作是「只讀／可自動」。
2. 定義哪些動作是「有副作用／需人工批准」。
3. 對副作用 endpoint 加人工批准驗證。
4. 前端只在 session 內保存批准憑證。
5. 正式執行前提供差異或完整內容預覽。
6. 正式部署後做 smoke test，證明沒有批准時一定不能執行。
7. 成功後記錄 commit、測試、正式部署結果，才標記為「可複製」。

## V1 完成證據

- PR #24：Threads 人工執行閘門，以最新 main 重建。
- PR #25：保護正式發布 config，手機最後確認才能開啟 live publish。
- PR #26：正式 Worker 部署後自動 smoke-test approval gate。
- 2026-09-29：PR #26 合併後 Worker Safety Checks、Cloudflare Worker production verification、GitHub Pages deployment 均成功。

## 建議複製順序

先複製到「只會改內容、不碰金流」的專案，再擴大到部署或其他副作用動作。任何付款、刪除資料、API key／安全設定變更，維持紅線：不可自動批准。
