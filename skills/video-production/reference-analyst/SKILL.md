# Reference Analyst Skill V2 — Public Video Intelligence

## Mission
在正式製片開始前，先用可驗證的公開資料找出同題材、同平台、同受眾的高表現影片，拆解可學習的結構與節奏，產出 `referenceBrief` 給 Planning、Marketing Strategy、Creative Producer、Screenwriter、Director 使用。

這個 Skill 的目的不是抄片，也不是把「高觀看」當成成功保證，而是把公開可觀察的市場證據轉成可驗證的製片假設。

## Evidence Basis
### Official / professional sources
- YouTube Data API 公開 `statistics.viewCount`、`statistics.likeCount`、`statistics.commentCount` 可用於公開表現比較。
- YouTube Analytics 的 `engaged views`、`stayed to watch`、average view duration、average percentage viewed 屬於創作者後台/第一方數據；若無權限，不得假裝取得。
- 自 2026-08-24 起，YouTube 對所有影片格式的公開 `viewCount` 改為影片開始播放即計入；跨這個日期比較公開 views 時必須標示 `metricRegime`，避免把不同計數制度直接混比。

### Evidence hierarchy
1. 平台官方定義與公開 API 欄位。
2. 可直接驗證的影片公開數據。
3. 多支影片共同出現的結構模式。
4. 美女顧問團第一方 Analytics。
5. 單支案例只可當假設，不可升格成通用規則。

## Inputs
- topic / product
- target audience
- platform
- locale
- content objective
- desired CTA
- recency window
- minimum sample size
- Brand Bible / Compliance constraints

## Discovery Rules
正式美女顧問團任務原則至少收集 5 支可比影片；若同題材樣本不足，可降到 3 支，但 `confidence` 必須降低並註明。

每支候選片至少記錄：
- videoId / canonical URL
- title
- channel
- publishedAt
- duration
- format: Shorts / long-form / live / unknown
- public viewCount
- public likeCount（若平台可見）
- public commentCount（若平台可見）
- collectedAt
- metricRegime
- topicMatch
- audienceMatch
- formatMatch
- freshness

禁止：
- 用搜尋結果摘要猜觀看數。
- 用第三方未標來源數字覆蓋平台公開數據。
- 捏造 creator retention、CTR、engaged views、stayed-to-watch。
- 因單支爆款而直接認定某種 Hook 必然有效。

## Public Performance Features
可計算但必須標註為衍生值：
- `likeViewRatio = likeCount / viewCount`
- `commentViewRatio = commentCount / viewCount`
- `viewsPerDay = viewCount / ageDays`

限制：
- 這些是描述性 proxy，不是留存率、轉換率或內容品質真值。
- 小樣本、極新影片、廣告導流、頻道規模差異可能造成偏差。
- 不同 `metricRegime` 的 views 不直接合併排名。

## Structural Breakdown
每支影片拆解：
1. 0–3 秒 Hook：第一句、第一畫面、第一個問題/衝突。
2. First Cut：第一次顯著畫面變化時間。
3. First Payoff：第一次給答案/證據/視覺回報時間。
4. Story beats：問題 → 發展 → 反轉/揭露 → 證據 → 結果 → CTA。
5. Cut rhythm：平均鏡頭長度、密集區與刻意停頓區。
6. Presenter ratio：主持人口播 vs B-roll/UI/實景。
7. Visual types：真人、產品、UI、data card、cinematic B-roll、reaction、特效。
8. Effect beats：push、freeze、split screen、glitch、kinetic text、particles 等實際服務情節的位置。
9. Sound beats：停頓、SFX、music lift/drop、sound bridge、重音。
10. Proof pattern：產品操作、前後對照、真實 UI、實物、數據、示範。
11. CTA：時間點、語氣、畫面、是否與前面承諾一致。

## Pattern Mining
分析完後只輸出跨影片可重複的模式，例如：
- 多數高表現樣本都在 2 秒內提出具體問題。
- 多數樣本在 5–8 秒內給第一個 payoff。
- 同類影片通常在高潮前提高 cut density。

不得輸出：
- 「照著某某影片拍一模一樣」。
- 複製原腳本、口頭禪、人物設定、獨特笑點或獨特視覺設計。

## Originality Guard
`referenceBrief` 只能傳遞抽象結構：
- hook archetype
- pacing pattern
- beat timing
- proof strategy
- shot-category mix
- sound/effect density
- CTA pattern

不得傳遞可識別的受版權保護表達作為製作指令。

## First-party Feedback Loop
影片發布後，若有自家 Analytics，才可加入：
- engaged views
- stayed to watch
- average view duration
- average percentage viewed
- audience retention key moments
- own click/conversion metrics

Reference Analyst 必須區分：
- `publicEvidence`
- `firstPartyEvidence`

不得把兩者混成同一資料層。

## Gate
美女顧問團正式自動製片如果沒有有效 `referenceBrief`：
`REFERENCE_REQUIRED`

有效條件：
- sampleCount >= 5，或 >=3 且明確低 confidence
- 至少 3 個可驗證 publicEvidence 樣本
- 有 structuralBreakdown
- 有 patternSummary
- 有 originalityGuard
- 有 collectedAt / metricRegime
- 不包含捏造的 creator-only metrics

## Output
```json
{
  "status":"PASS|LOW_CONFIDENCE|REFERENCE_REQUIRED",
  "topic":"",
  "platform":"youtube",
  "collectedAt":"",
  "sampleCount":0,
  "metricRegimeNotes":[],
  "publicEvidence":[
    {
      "videoId":"",
      "title":"",
      "channel":"",
      "publishedAt":"",
      "duration":"",
      "format":"shorts",
      "viewCount":0,
      "likeCount":0,
      "commentCount":0,
      "likeViewRatio":0,
      "commentViewRatio":0,
      "viewsPerDay":0,
      "metricRegime":"post-2026-08-24",
      "topicMatch":0,
      "audienceMatch":0,
      "formatMatch":0,
      "structuralBreakdown":{}
    }
  ],
  "patternSummary":[],
  "hookArchetypes":[],
  "pacingPatterns":[],
  "proofPatterns":[],
  "effectPatterns":[],
  "soundPatterns":[],
  "ctaPatterns":[],
  "doNotCopy":[],
  "productionHypotheses":[],
  "confidence":"high|medium|low"
}
```

## Handoff
PASS → Planning + Marketing Strategy + Creative Producer。
LOW_CONFIDENCE → 可進人工審核，但不得直接當高信心自動製片依據。
REFERENCE_REQUIRED → 停在付費生成之前。

## Production-ready Definition
缺少公開來源、日期、metric regime、結構拆解、pattern summary、originality guard 任一項，只能標 DRAFT。