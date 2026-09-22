# 美女顧問團・Threads 自動成長 V1

## 範圍
本版本只做 Threads（脆）文字內容。明確排除短影片、HeyGen、YouTube、TikTok 與其他影音發布流程。

## 核心循環
1. 趨勢蒐集：蒐集近期與帳號主題相關的熱門議題與可延伸問題。
2. 顧問選題：依相關性、可提供價值、近期重複度選出候選題目。
3. 鉤子測試：同一題先產生 3 個不同前三行／開頭，再選一個成文。
4. Threads 成文：繁體中文、台灣口語、避免罐頭與硬廣告；優先真實開發紀錄、踩坑、觀察與可驗證成果。
5. 發布模式：review（先審核）或 auto（全自動）。V1 預設 review。
6. 成效回饋：保存每篇題材、鉤子類型、長度、發布時間，以及可取得的觀看、愛心、留言、轉發等指標。
7. 下一輪調整：提高有效題材／鉤子的探索比例，但保留新題材測試，避免單一模板越發越像。

## V1 內容池
- 美女顧問團開發日記
- AI 自動化實驗
- 一人公司實作
- 開發踩坑與修正
- 自己作品的開發過程

## 必要保護
- 不大量自動留言、不自動互追、不洗互動。
- 不編造觀看數、成長率、客戶案例或收益。
- 不把「推測會爆」寫成事實。
- 同題／同鉤子設冷卻時間，避免重複洗版。
- 自動模式必須可立即停用。

## 預計 Worker API
- POST /threads-growth/config：讀寫發布模式、主題池、頻率、冷卻規則。
- POST /threads-growth/discover：找候選題目。
- POST /threads-growth/draft：產 3 個鉤子與完整 Threads 草稿。
- POST /threads-growth/approve：人工批准待發布稿。
- POST /threads-growth/test-publish：安全乾跑；驗證已批准的文字與發布 payload，但**不呼叫 Threads、絕不建立公開貼文**。
- POST /threads-growth/publish：經官方 Threads 發布授權後送出文章；還必須先在 config 設定 `livePublishEnabled: true`，預設關閉。
- POST /threads-growth/metrics：保存／同步可取得的貼文成效。
- POST /threads-growth/learn：根據歷史表現產生下一輪內容權重。

## 第一個安全測試入口
依序呼叫 `discover` → `draft` → `approve` → `test-publish`。最後一步回傳 `dryRun: true` 才算通過，代表完整文字產線已驗證、但尚未對外發文。

正式發布前才需要：
1. 在 Meta Developers 建立並設定 Threads App，Redirect URI 必須是 Worker 的 `/threads-growth/oauth/callback`。
2. 在 Worker 設定 `THREADS_APP_ID`、`THREADS_APP_SECRET`、`THREADS_REDIRECT_URI`，並綁定 `MONITOR` KV。
3. 呼叫 `/threads-growth/oauth-start`，完成官方 OAuth。
4. 把 config 的 `livePublishEnabled` 明確改成 `true`，才可呼叫 `publish`。

## 完成定義
第一階段不是「能生成 Threads 文」就算完成，而是至少跑通：選題 → 成文 → 審核 → 安全測試 → 官方授權發布 → 紀錄 → 下一輪調整。