# 美女顧問團 AI 製片公司｜Production Standard V2

## 組織原則
每位員工必須有自己的職位、SKILL、Character Bible、Visual Bible 與 KPI。不得用同一個 Prompt 只換角色名稱。現有顧問團員工依製片公司實際需求重新盤點；職位不合適者優先轉崗，不為保留舊職稱硬塞工作。只有確實缺少專業能力時才新增角色。

## 製作流水線
市場/行銷策略 → 企劃 → 編劇 → 導演 → 攝影 → 美術/道具 → 表演/聲音 → 高品質影像生成 → 剪接/後製 → 平台包裝 → QC/監製 → 發布 → 數據分析 → Learning Memory。

Production Orchestrator 只負責任務調度、版本、成本、退件路由與狀態，不取代專業 Skill。

## 獨立 Skill 標準
每個 Skill 必須定義：責任邊界、輸入、專業判斷、工作步驟、結構化輸出、退件條件、交接對象、版本與 KPI。

## 角色與造型
每位員工建立獨立 Character Bible + Visual Bible，至少包含：employeeId、姓名、職位、角色定位；穩定臉部特徵、髮型、身形比例與年齡感；主服裝、職位服裝、2–3 套可控工作造型；妝感、配件、代表色、工作場景、鏡頭氣質；說話方式、個性、表情與動作習慣；允許使用的 avatar/voice/look/asset ID；禁止漂移項目：身份、核心臉型、主要聲線、角色定位。真人臉、聲音與素材必須有授權；未授權不得自動複製或生成冒充。

## 母片規格
- 預設 9:16、1080p、30–45 秒；1080p 只是輸出規格，不代表通過精品品質。
- 7–10 鏡；原則每 2–4 秒有有意義的視覺變化；單一靜態 talking head 不得超過 6 秒。
- 前 2–3 秒必須有清楚 Hook。
- 必須有故事弧：問題/衝突 → 發展 → 轉折 → 高潮/證據 → 結果 → CTA。
- 人物不可成為整支影片唯一畫面；依題材混用高擬真 B-roll、真實產品/UI、資料卡、圖像、動態字。
- 特效、音效、字幕與轉場必須服務故事節拍。

## Premium Visual Reference Bar｜高擬真影像基準
95 分精品母片的目標不是「AI 人物會說話」，而是接近高品質商業 Reel / AI 電影短片的視覺完成度。每一個主要生成鏡頭都必須檢查：
- photorealism：主體不可有廉價塑膠感、蠟像感、過度磨皮。
- textureDetail：皮膚、毛髮、布料、金屬、食物、木材等材質必須有可信微細節。
- lighting：主光、補光、輪廓光與環境反射合理，避免平光與假 HDR。
- depthOfField：景深必須自然並服務主體，禁止假散景吃掉產品/UI。
- motionCoherence：人物、動物、手部、物件、液體、食物與背景在連續影格中不可漂移、融化、瞬移。
- physicalPlausibility：重力、接觸、遮擋、反射、陰影、物件互動要合理。
- identityConsistency：同一角色跨鏡頭臉型、髮型、服裝、身形與聲線一致。
- cinematicComposition：構圖、景別、視線、前中後景、鏡頭運動必須有導演意圖。
- subjectSeparation：主體與背景有自然層次，不靠粗糙描邊或過度銳化。
- artifactControl：手指/牙齒/眼睛/耳朵/文字/Logo/餐具/產品邊緣不得明顯變形。

## 影像製作策略
高品質動態影像與 B-roll 是母片主要視覺來源；HeyGen/數字人主要負責需要主持、解說、對話與品牌角色一致性的鏡頭，而不是強迫整支影片都由數字人講話。導演依故事決定 Avatar、cinematic AI video、產品 UI、真實素材、圖卡與特效的比例。

精品片預設策略：先做高品質關鍵鏡頭，再做人物解說鏡頭，最後由 Editor 統一色調、節奏、音效、字幕與特效。不得因為某個工具方便，就讓工具能力反過來限制導演設計。

## V3 品質閘門
- <90：不得自動發布。
- 90–94：正式可發布，但不得標記 Premium。
- >=95：只有在內容品質與 Premium Visual Reference Bar 同時通過時，才是精品母片。
- 硬性退件：face_break、lip_sync、wrong_identity、blank_frame、broken_audio、unsafe_caption、no_story、no_effect_design、plastic_ai_look、texture_failure、motion_morphing、physics_break、hand_object_deform、background_melting、identity_drift。
- 任何硬性退件即使總分 >=95 仍不得 Premium/自動發布。
- QC 必須指出責任 Skill、sceneId、時間碼與修復範圍；優先局部修復，禁止無理由整支重生。

## 精品影像分數
Premium Visual Score 100：photorealism 18、textureDetail 12、lighting 12、motionCoherence 15、physicalPlausibility 10、identityConsistency 12、cinematicComposition 10、artifactControl 11。Premium Visual Score <90 時，即使故事/行銷總分高也不得成為精品母片。

## 成本原則
先用文字與結構化資料完成企劃、劇本、導演、攝影、美術與預檢，再消耗影片生成額度。整支影片重生預設最多 1 次；能局部重做就局部重做。精品鏡頭允許較高單鏡預算，但必須由 Cost Controller 記錄並與一般片成本分開。