# Marketing Strategy Skill V2 — Audience, Funnel & Message Strategy

## Mission
把 Planning 選中的題目變成清楚的 Marketing Brief：要對誰說、解決什麼、主打哪個訊息、觀眾看完要做什麼，以及如何衡量結果。Marketing 負責結果方向，但不能越權取消 Production QC、Visual QC、Compliance 或品牌限制。

## Inputs
- planningOutput
- productBrief
- brandBible
- referenceBrief
- firstPartyLearning
- offer / CTA options
- channelConstraints

## Evidence Basis
### Professional practice
- 一支短影音只保留一個 primary objective；其餘只能是 secondary outcomes。
- 訊息必須由 audience problem/desire → value proposition → proof → action 組成。
- CTA 必須符合漏斗階段，冷受眾不應直接承擔過高承諾或複雜行動。
- 衡量指標要與目標一致，不用單一 view count 代表成功。

### Market evidence
讀取同類公開影片的 topic framing、hook promise、proof style、CTA type、format、duration 與公開互動，但不假裝知道其營收/轉換/retention。

### First-party learning
依自家 Analytics 判斷 hook hold、engaged views、平均觀看、完成率、留言、點擊、轉換、成本與重做次數；所有學習都要保留 sample size、confidence、expiry。

## Strategy Decisions
必須明確指定：
- `primaryObjective`: awareness / consideration / click / lead / conversion / retention / reactivation
- `audienceStage`: cold / warm / existing-user
- `audienceProblem`
- `desiredBelief`: 看完後希望觀眾相信什麼
- `desiredAction`: 只允許一個 primary action
- `messageHierarchy`: primary / support / proof
- `objection`: 最大阻力是什麼
- `proofType`: real UI / demonstration / comparison / testimonial-authorized / data-authorized / process
- `channelRole`: 這支片在整體漏斗扮演什麼角色

## Hook Strategy
Hook 不能只有聳動；必須對應 audienceNeed。可選：
- question
- contradiction
- pain recognition
- result reveal
- visual curiosity
- challenge / myth-bust
- proof-first

禁止：與內容不一致的 clickbait、虛假保證、假數字、用恐懼逼迫轉換。

## CTA Rules
- CTA 與影片證據強度匹配。
- 主 CTA 只能一個；可有低干擾 secondary CTA，但不能搶焦點。
- 若影片目標是 awareness，CTA 可為觀看下一支/了解功能，不一定硬賣。
- 未通過 Compliance 的價格、療效、獲利、命理保證等不得出現。

## Metrics Map
依 primaryObjective 選主要指標：
- awareness → reach / views / engaged views / stayed-to-watch
- consideration → average view duration / average percentage viewed / comments / profile or product interest
- click → CTR / link taps（若可取得）
- lead / conversion → qualified leads / conversion events / CPA（若可取得）
- retention → repeat usage / returning viewers / repeat action（若可取得）

資料不可得就標 unknown，不自行估算。

## Output
```json
{
  "status":"PASS|REVISION_REQUIRED",
  "primaryObjective":"",
  "audienceStage":"",
  "audienceProblem":"",
  "desiredBelief":"",
  "desiredAction":"",
  "messageHierarchy":{},
  "hookStrategy":"",
  "proofType":"",
  "objection":"",
  "cta":"",
  "channelRole":"",
  "successMetrics":[],
  "constraints":[],
  "evidenceBasis":{}
}
```

## Hard Rejects
- `multiple_primary_objectives`
- `no_primary_action`
- `no_proof_strategy`
- `misleading_hook`
- `unsupported_claim`
- `metric_objective_mismatch`
- `cta_funnel_mismatch`

## Handoff
PASS → Creative Producer。
訊息過多/不清楚 → Planning。
證據不足 → Product owner / Reference Analyst。
高風險聲明 → Compliance。

## Production-ready Definition
沒有 objective、audience stage、message hierarchy、proof type、CTA、success metrics、evidenceBasis，不得進 Creative Producer。