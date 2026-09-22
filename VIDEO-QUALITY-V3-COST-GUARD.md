# Video Quality V3 — Token / 重製成本閘門

目標：追求 95 分精品母片，但禁止用「整支無限重抽」換品質。

## 執行順序
1. **Token 預審**：題材、腳本、逐字稿、7–10 鏡導演計畫先由文字模型審查；未達結構標準，不送 HeyGen。
2. **Preflight**：前三秒鉤子、完整劇情弧、至少 4 個有效特效節點、至少 4 類視覺、單鏡 <= 6 秒、人物原則 <= 55%。不合格只重寫文字/分鏡。
3. **昂貴生成最後才做**：Preflight 通過後才建立 HeyGen job。
4. **成片 QC**：90 以下禁止自動發布；95 以上標記精品母片。
5. **局部重製優先**：字幕、旁白、單鏡、B-roll、UI、特效或聲音哪裡失敗就只修哪裡；只有 identity/全片音訊/結構性失敗才允許整支重做。

## Token / 重試預算
- directorPlanAttempts: 2（第一次 + 最多一次文字修正）
- qcTextAttempts: 1
- fullVideoRegenerations: 1（預設最多一次；超過需人工批准）
- partialSceneRegenerations: 3
- 同一問題不得連續用相同 prompt 重抽。

## 自動發布規則
- < 90：regenerate / repair，不發布。
- 90–94：可正式發布，但標記 `needs_improvement`。
- >= 95：`premium_master`。
- hard failure：一律阻擋自動發布。

## Hard failures
`face_break`, `lip_sync`, `wrong_identity`, `blank_frame`, `broken_audio`, `unsafe_caption`, `no_story`, `no_effect_design`。

## 成本原則
**先燒便宜 Token 找問題，再決定是否燒影片生成額度。** 系統不得為追求 95 分而無上限自動重做。
