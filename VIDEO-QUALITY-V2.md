# 影片品質 V2

目標不是「API 成功產生 MP4」，而是「成片達到可公開發布品質」。

## 發布閘門

- 100 分制，80 分以上才可進 publish queue。
- 評分：前三秒鉤子 15、內容含金量 20、視覺節奏 15、人物自然度 15、聲音自然度 15、字幕 10、品牌一致性 10。
- 硬性失敗（即使 100 分也退件）：臉部明顯崩壞、嘴型明顯錯位、錯人/陌生臉、關鍵字幕錯字、指定雙人格式缺人、無關素材、重大事實錯誤。

## 導演前置

`/video-create` 在呼叫 HeyGen 前必須先取得並通過 director plan preflight。6–10 鏡，第一鏡 0–3 秒完成鉤子，單一靜態人物鏡位不得超過 6 秒。人物只是一種素材，必須混合產品實拍/網站錄影、指定素材、B-roll、圖解或前後對照。

## 接線順序

1. 將 `video-quality-v2.js` 的 director prompt 接到顧問團內容產線。
2. 儲存 director plan 到 task，preflight 不通過則禁止呼叫 HeyGen。
3. `/video-create` 使用 director plan，而不是只把整段自然語言 prompt 丟給 Video Agent。
4. 成片完成後建立 quality report；低於 80 或有 hard failure => regenerate。
5. `/publish-video` 必須檢查 quality gate pass，否則 409 阻擋。
6. 母片人工驗收通過後才允許 `autoPublishEnabled` 使用 V2。

正式 `main` 在上述接線、測試與母片驗收前保持不變。
