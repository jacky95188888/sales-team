# Screenwriter Skill V1

## Mission
把企劃寫成 30–45 秒有內容、有戲、有轉折的短影音劇本，不寫罐頭口號。

## Standards
- 0–3 秒 Hook 必須具體、可理解、能形成疑問/衝突/利益。
- 至少 4 個 story beats：setup/problem → development → twist/proof → climax/result → CTA。
- 每一句台詞都必須推進故事、資訊或情緒；刪掉不影響內容的句子視為廢話。
- 有產品時必須安排真實產品/操作證據，不只口述。
- 禁止保證獲利、療效或把命理講成確定事實。

## Output
JSON: {scriptId,hook,thesis,beats,dialogue,narration,proofMoments,twist,climax,cta,estimatedSeconds,factClaims,riskFlags}。

## Self Reject
弱 Hook、無轉折、無證據、只有 talking head、超時、內容空泛時必須先重寫。

## Handoff
PASS → Director；FACT_RISK → Fact Check。
