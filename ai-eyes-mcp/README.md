# AI Eyes → ChatGPT 工具橋接（待啟用）

這是一個**獨立的 Cloudflare Worker**，不覆蓋已運作的 AI Eyes V3.3。它把既有 `POST /analyze` 和 `POST /result` 轉成兩個 ChatGPT 可呼叫的 MCP 工具。來源基於 Cloudflare 官方 GitHub OAuth MCP 範例，再加入 AI Eyes 專用路由與擁有者白名單。

## 目前狀態

- 已完成程式與本機型別檢查；API 測試使用 mock，未呼叫付費模型。
- **尚未部署、尚未接入 ChatGPT，沒有完成真實影片端到端測試。**
- 正式 AI Eyes V3.3 的密鑰存在於原 Worker，但 Cloudflare 不會揭露值；此新 Worker 的後端密鑰仍需安全配置。
- 由 GitHub `jacky95188888` OAuth 登入後才會發放 MCP 權杖。所有工具再檢查同一白名單。
- `analyze_video` 建立一個可能計費的背景任務；逾時不自動重新建立。`get_video_result` 讀取任務結果，標為未核實的模型報告。

## 啟用前置

1. 在 GitHub 建立**此橋接專用的 OAuth App**，Callback 為 `https://ai-eyes-mcp.rhtm9y855y.workers.dev/callback`。
2. 在 Cloudflare 為此獨立 Worker 建立 `OAUTH_KV`，將 namespace ID 寫進 `wrangler.jsonc`。
3. 使用 Cloudflare Secrets 配置 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`COOKIE_ENCRYPTION_KEY`（隨機 32 bytes 以上）、`AI_EYES_ACCESS_TOKEN`（現有 AI Eyes 存取密碼）；不要放入 GitHub、聊天或程式碼。`ALLOWED_GITHUB_LOGIN` 保持為實際帳號。
4. 執行 `npm ci`、`npm run type-check`、`npm run deploy`。部署時確認目標**只**是 `ai-eyes-mcp`，不要修改 `ai-eyes-video`。
5. 用 MCP Inspector 連 `https://ai-eyes-mcp.rhtm9y855y.workers.dev/mcp`，確認 OAuth、工具列表、未授權拒絕、背景任務與結果查詢。
6. 在 ChatGPT 網頁版 Plugins → Add custom MCP server，輸入相同 `/mcp` URL，選 OAuth，完成 GitHub 登入並安裝個人外掛；之後在 Work 聊天以 `@AI Eyes` 呼叫。

## 驗收

- 未登入、非白名單 GitHub 帳戶都無法取得影片內容或建立任務。
- 先測既有任務 ID 的 `get_video_result`，再用一支短片跑 `analyze_video`，核對回傳的 `jobId` 與原 UI 結果一致。
- 最後用已知聲畫事件短片比對時間碼，標示模型推論與未知部分；API 回 200 不等於影片理解正確。
