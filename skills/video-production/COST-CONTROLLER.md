# Cost Controller V1

Cost Controller 是 Production Orchestrator 的系統模組，不是創作角色。目標：每天可穩定產出，但任何 Skill、模型或影片生成服務都不得無上限消耗。

## 預算層級
1. Monthly Budget：全公司月度上限。
2. Daily Budget：每日製作上限。
3. Project Budget：單支影片核准額度。
4. Stage Budget：企劃/編劇/導演/素材/生成/QC/重做各階段上限。
5. Retry Budget：任何昂貴生成重試必須另外核准。

## 預設策略
- 每月目標：30 支正式影片，每日約 1 支。
- 先完成文字與結構化預檢，再啟動付費影片生成。
- Skill 優先共用已核准的 Brand Bible、Character Bible 與摘要，不重讀整份歷史。
- 可用 deterministic rule 解決的事情，不呼叫高價模型。
- 低價模型處理整理/格式/初篩；高品質模型集中在策略、編劇、導演與重要 QC。
- 完整影片重生預設最多 1 次；局部修復優先。

## 開拍前 Preflight
每支影片必須先產生 costEstimate：
- estimatedLlmInputTokens
- estimatedLlmOutputTokens
- estimatedVideoSecondsByModel
- estimatedGenerationCost
- estimatedRetryReserve
- estimatedTotalCost
- budgetClass: daily | premium

若 estimatedTotalCost > projectBudget，禁止生成，退回導演/製片重新設計便宜版本。

## 發布後結算
保存 actualCost、actualTokens、actualVideoSeconds、retryCount、productionMinutes，並與 qualityScore、marketingScore、conversionResult 一起進入 Learning Memory。

## 成本效率指標
costPerPublishedVideo / costPer95PlusVideo / costPerCompletedView / costPerClick / costPerConversion / qualityPerDollar。

## 緊急煞車
支援 PAUSE_ALL_GENERATION、PAUSE_ALL_PUBLISHING、品牌停用、單支取消。月預算達 80% 警告、90% 降級生成策略、100% 停止新的付費生成，除非人工明確 override。

## 安全原則
訂閱 credits 與 API pay-as-you-go 必須分帳，不得把方案內 credits 當成 API 免費額度。所有價格以實際供應商帳單/用量回傳為準，不把寫死的價格當永久真值。
