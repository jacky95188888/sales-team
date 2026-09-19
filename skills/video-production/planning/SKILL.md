# Planning Skill V2 — Content Planning & Opportunity Selection

## Mission
在任何付費生成之前，決定「這支片值不值得做」。把市場訊號、產品目標、品牌限制與平台情境整理成可執行選題，避免一開始就直接寫稿或生成影片。

## Inputs
- productBrief
- brandBible
- marketingObjective
- audienceContext
- marketSignals
- referenceBrief
- firstPartyLearning
- costBudget

## Evidence Basis
### Professional source
使用可驗證的行銷/製作原則：目標、受眾、單一核心訊息、行動要求、製作限制必須在創意製作前先定義。

### Market evidence
只採用公開可驗證資料：近期同類主題、公開觀看、按讚、留言、發布時間、內容格式、長度、可見互動。看不到的 retention、轉換率、後台數據一律標 unknown。

### First-party learning
優先讀取美女顧問團自己已發布內容的 engaged views、average view duration、average percentage viewed、stayed-to-watch、留言主題、點擊/轉換（若有）與每支成本。

## Opportunity Score
每個候選題目分別評估，但禁止只靠總分自動決策：
- relevance：與產品/品牌是否直接相關
- audienceNeed：是否對目標觀眾有明確問題/慾望
- novelty：是否有新角度
- proofability：能否用真實產品/UI/案例證明
- visualPotential：能否做出強視覺與情節
- timeliness：現在做是否有時效價值
- feasibility：現有素材、角色與工具能否穩定完成
- expectedValue：可能帶來觀看、互動、點擊或轉換的價值
- costRisk：生成與重做成本

## Decision Rules
- 題目只有「熱門」但與產品無關 → 拒絕。
- 題目有流量但沒有可證明內容 → 降級或重寫。
- 題目需要捏造數據/成果才能成立 → 拒絕。
- 題目只能靠長 talking head 才講得完 → 重構。
- referenceBrief 只有單一影片 → 不得當成市場共識。
- 沒有明確 audience / objective / CTA → 不進 Screenwriter。

## Output
```json
{
  "status":"PASS|REVISION_REQUIRED|HOLD",
  "topic":"",
  "whyNow":"",
  "audience":"",
  "audienceNeed":"",
  "marketingObjective":"",
  "singleMessage":"",
  "proofPlan":[],
  "referenceSummary":{},
  "riskNotes":[],
  "costClass":"low|medium|high",
  "successMetrics":[],
  "handoffNotes":""
}
```

## Hard Rejects
- `no_audience`
- `no_objective`
- `no_proof_path`
- `fabricated_claim_required`
- `trend_only_no_brand_fit`
- `reference_too_weak`
- `cost_exceeds_budget`

## Handoff
PASS → Marketing Strategy。
需要補市場證據 → Reference Analyst。
成本超標 → Cost Controller。
產品事實不清楚 → Producer / Product owner。

## Production-ready Definition
缺 audience、objective、singleMessage、proofPlan、referenceSummary、successMetrics 任一核心欄位，只能是 DRAFT，不得進正式製片。