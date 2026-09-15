# Video Quality V3 — AI 行銷製片公司 MASTER PLAN

> 單一真相來源（Single Source of Truth）。任何聊天中確認的新需求，先記入本總帳，再進施工、測試與發布。禁止把「已討論」說成「已完成」。

## 狀態定義
- DISCUSSED：已確認需求，尚未完整寫入系統。
- IMPLEMENTED：已寫入 `video-quality-v3-clean`，但尚未完整實測。
- VERIFIED：程式/Action/Worker/實際影片已驗證。
- BLOCKED：有明確阻塞原因。

## 目前正式施工線
- Repo：`jacky95188888/sales-team`
- Branch：`video-quality-v3-clean`
- PR：#15 `Video Quality V3：95 分精品母片引擎`
- `main`：驗證前不得合併。
- 舊污染分支 `upgrade/video-quality-v2` 與 PR #14：禁止合併。

## 核心目標
建立真正的 AI 行銷製片公司，不是 AI 人物念稿：
市場雷達 → 行銷策略 → Creative Producer → 選題企劃 → 編劇 → 導演 → 攝影 → 美術/道具 → 表演/聲音 → 高品質影像生成 → 剪接後製 → 平台包裝 → Compliance/Fact Check → Production QC + Visual QC → Experiment → Publishing → Analytics → Learning Memory → 隔日調整。

## SKILL 專業證據標準
### IMPLEMENTED — 所有新/升級 Skill 必須遵守
每個 Skill 不能只靠角色 Prompt 或模型常識。專業規則必須標示 `evidenceBasis`，至少分三層：
1. `professionalSource`：官方/專業製作教材、平台官方指南、工具原廠認證訓練或可驗證業界流程。
2. `marketEvidence`：近期同類高表現公開影片的結構資料；使用 views/likes/comments 等公開數據，不能捏造後台 retention。
3. `firstPartyLearning`：美女顧問團自己發布後的 Analytics、QC、成本與版本實驗結果。

規則來源優先序不是盲目服從單一來源：安全/法規/品牌硬限制 > 可驗證專業製作原則 > 本產品第一方實驗結果 > 市場樣本共同模式 > 單一案例。

每個 Skill 至少要有：`mission`、`inputs`、`professionalKnowledge`、`decisionRules`、`hardRejects`、`outputs`、`handoff`、`kpi`、`evidenceBasis`、`version`。沒有 evidenceBasis 的 Skill 只能標 DRAFT，不得稱為 production-ready。

目前已採用的專業來源方向：
- Adobe 官方 production guidance：shooting script、storyboard、shot list、coverage、blocking，以及 Director/Cinematographer 在拍攝前共同決定鏡位與需求。
- Blackmagic Design 官方 DaVinci Resolve Training：editing、color、visual effects、Fairlight sound design/audio、delivery，作為 Editor / Color / VFX / Audio 專業知識來源。
- YouTube 官方 Help/Analytics：Shorts 的 views、likes、engaged views、stayed-to-watch、audience retention/key moments，以及 hook、storytelling、packaging/metadata 等平台表現概念。

專業資料必須轉成可執行判斷，不可大段複製教材文字。來源若更新，要記 `sourceCheckedAt` 與 Skill version。

## 品質規則
### IMPLEMENTED
- V3.1：正式母片最低 1080p。
- TikTok / Shorts / Reels 預設 9:16。
- 7–10 鏡；單鏡靜態不得超過 6 秒。
- 至少 4 個故事節點、4 個特效節點、4 種視覺素材。
- Presenter / Avatar 佔比不得超過 55%。
- generic motion graphics 不得佔過半鏡頭，也不能冒充高品質 B-roll。
- 台灣中文禁止 `zh-cn` locale。
- <90 不得自動發布；>=95 才可稱精品母片。

### IMPLEMENTED / NEED RUNTIME VERIFICATION
- Premium Visual QC：photorealism、texture、lighting、motion coherence、physical plausibility、identity consistency、cinematic composition、artifact control。
- 視覺硬退件：plastic AI look、臉/手/物件變形、motion morphing、physics break、background melting、identity drift、文字/logo/UI corruption、嚴重 flicker、edge warp、不自然 DOF。
- 自動發布只能接受 server-side trusted QC；前端或人工填分不得解鎖 auto-publish。

## HeyGen 失敗基準（Failure Benchmarks）
### VERIFIED OBSERVATIONS
1. 天衡命理｜問答鉤子型短影音 A：1080p、9:16、約31秒、8 scenes；7/8 高度 Avatar 化。證明 1080p + Avatar V 本身不等於精品影片。
2. 天衡命理｜紫微斗數財帛宮解密：720p、16:9、約78.7秒、13 scenes；大量 generic motion graphics。與短影音精品目標不符。
3. 美女顧問團：決策不再靠猜測：720p、9:16、約39.4秒、10 scenes；Avatar IV + 大量 generic motion graphics；至少一鏡 `zh-cn` locale。

舊影片只作 Failure Benchmark，不修改、不當成功模板。

## YouTube 高表現 Reference Gate
### DISCUSSED — 下一階段必須施工
美女顧問團每次正式製片前，YouTube 高表現影片結構是重要參考資料，不得跳過。

Reference Brief 優先使用同題材、同平台/短影音型態、近期且公開成績可驗證的樣本。公開可用欄位：videoId/title/channel/publishedAt/views/likes/comments/like-view ratio/topic/format/duration。2025-03-31 後 YouTube Shorts 公開 views 的計數方式已改為每次開始播放或重播即可計入，因此跨時期比較時必須標記 metric regime；`engaged views` 才保留「選擇繼續觀看」的比較用途。拿不到創作者後台 retention / engaged views 時標記 unknown，不得推測。

每支有效樣本拆解：0–3 秒 Hook、第一次切鏡、第一次 payoff、平均換鏡節奏、story beats、conflict/twist/reveal、climax timing、presenter ratio、cinematic B-roll/real UI/product proof、effects density、caption rhythm、SFX/BGM beats、CTA。

Director Skill 只能學習多支作品的共同結構、節奏與製作技法；禁止複製單一作品的腳本、角色、獨特畫面或創意表達。

### 待實作硬閘門
- 美女顧問團正式自動製片必須有 `referenceBrief`。
- Reference 必須與題材/格式相關，並保存來源時間與公開成績證據。
- 過舊、無公開表現依據、題材無關的樣本不得單獨滿足 Reference Gate。
- Reference Brief 先交 Marketing Strategy / Creative Producer，再交 Screenwriter / Director。
- Reference 只影響結構學習，不得凌駕 Brand Bible、Compliance、Production QC、Visual QC。

## 獨立員工 Skills
### IMPLEMENTED
- Director
- Screenwriter
- Editor
- QC Supervisor
- Premium Visual QC
- Cost Controller

### DISCUSSED / 待確認分支內容後補齊
- Planning
- Cinematography
- Art & Props
- Performance & Voice
- Packaging
- Analytics
- Marketing Strategy
- Creative Producer / Reference Analyst（YouTube Reference Gate 的主要 owner）

每位員工必須有自己的 Skill、角色定位、Character Bible、Visual Bible、KPI、上游、下游與禁止事項；Orchestrator 只協調，不得假裝一個 AI 就是所有專業人員。

## 成本控制
### IMPLEMENTED
- 先做文字/結構 preflight，再花 HeyGen/影像生成費。
- 預設完整重生最多 1 次，優先局部修鏡。
- HeyGen 訂閱 credits 與 API spend 分開統計。
- 80% 月預算警告、90% 降級、100% 停止新的付費生成。

## Worker / Actions 待辦
### BLOCKED / NEED FIX
- `scripts/patch-video-v3-tests.mjs` 曾有 `'''` 非法 JS 語法，需要改成安全 template literal / deterministic replacement 並重跑 Action。
- QC/publish patch 曾因實際 Worker anchor 不符而安全失敗；必須依目前 Worker 真實 publish function 重寫，不可猜 anchor。
- Worker Safety test 的舊 Anthropic mock 未回 V3 director JSON，preflight 409；需更新 mock。

### DISCUSSED / MUST IMPLEMENT
- Trusted Production QC 與 Trusted Visual QC 分離人工/公開評分。
- fields：`visualQuality`, `visualReviewSource`, `visualReviewVersion`。
- Auto-publish 必須 Trusted Production PASS + Trusted Visual PASS。
- 無 server-side visual review 時保持 `VISUAL_QC_REQUIRED`，不得假裝已通過。
- Premium：Production >=95 + Visual >=90 + 無 hard failure。
- auto-publish worker 遇到 QC 未完成應 hold/skip，不得反覆 409。
- YouTube Reference Gate 接入真正的生成前 Worker pipeline。

## 發布前 Checklist
1. Marketing Brief 有目標受眾、目的、CTA。
2. 美女顧問團任務有有效 YouTube Reference Brief。
3. Screenwriter Skill PASS。
4. Director Skill + V3 Preflight PASS。
5. 成本預算 PASS。
6. 生成規格 >=1080p、短影音 9:16、台灣中文 locale 正確。
7. Editor / Packaging 完成。
8. Trusted Production QC >=90。
9. Trusted Visual QC >=90 且無 hard failure。
10. Premium 標記只在 Production >=95 且 Visual >=90 時成立。
11. 發布後 Analytics 寫回 Learning Memory。

## 工作紀律
- 每個需求都必須標記狀態。
- 每次 GitHub 寫入記 commit。
- 未驗證不得標 VERIFIED。
- 聊天記憶不是專案資料庫；本 MASTER PLAN 才是 V3 專案施工總帳。
- 每次新增規則後同步更新本檔，避免遺漏。