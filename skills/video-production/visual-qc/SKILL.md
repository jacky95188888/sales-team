# Premium Visual QC Skill V1

## Mission
專門驗收「影像本身」是否達到高品質商業 Reel / AI 電影短片等級。此 Skill 與故事 QC 分離，避免 1080p、劇本好或總分高掩蓋廉價 AI 畫面。

## Input
renderId、scene renders、final render、Director Intent、Cinematography Plan、Art Plan、Character/Visual Bible、產品 UI reference、generation metadata。

## Frame & Motion Inspection
逐鏡檢查開頭/中段/結尾關鍵影格與動態連續區段；高風險鏡頭（臉、手、物件互動、食物、液體、產品 UI、文字、雙人互動）提高抽查密度。

## Premium Visual Score 100
- photorealism 18：是否有塑膠臉、蠟像、假皮膚、過度磨皮、AI 油畫感。
- textureDetail 12：皮膚、毛髮、布料、金屬、木材、食物等微細節可信度。
- lighting 12：主/補/輪廓/環境光、陰影、反射與曝光是否合理。
- motionCoherence 15：連續影格中臉、手、身體、物件、背景是否漂移/融化/瞬移。
- physicalPlausibility 10：重力、接觸、遮擋、反射、液體/食物/道具互動是否合理。
- identityConsistency 12：跨鏡頭臉型、髮型、服裝、比例與角色辨識一致。
- cinematicComposition 10：景別、構圖、前中後景、視線、景深與運鏡是否有導演意圖。
- artifactControl 11：手指、眼睛、牙齒、耳朵、文字、Logo、餐具、產品邊緣與背景無明顯生成瑕疵。

## Hard Failures
plastic_ai_look、face_break、hand_object_deform、motion_morphing、physics_break、background_melting、identity_drift、text_logo_corruption、product_ui_corruption、severe_flicker、subject_edge_warp、unnatural_depth_of_field。

## Gate
- visualScore <90：不得標 Premium。
- visualScore >=90 且無 hard failure：Visual PASS。
- 最終精品母片仍需 Production QC 總分 >=95。
- 任何 hard failure：FAIL，不得因平均分高而放行。

## Repair Routing
每個 finding 必須輸出 sceneId、timeRange、failureCode、severity、evidence、ownerSkill、recommendedRepair。
- 人臉/身份 → Character/Generation。
- 鏡頭/景深/光線 → Cinematography。
- 材質/道具/UI → Art & Props / Generation。
- 動態融化/物理錯誤 → Generation，優先局部重生。
- 節奏/轉場造成的視覺問題 → Editor。

## Cost Rule
不得看到單一瑕疵就整支重生。先判定可否 crop、cut、replace shot、局部重生或用 B-roll 遮換；只有跨多鏡頭的系統性 identity/visual failure 才建議 full regeneration。

## Output
JSON: {reviewId,renderId,visualScore,pass,hardFailures,dimensions,sceneFindings,repairOrders,reviewSource,reviewVersion}。

## Trust
只有 server-side trusted review 才可成為 auto-publish 的 Visual Gate。前端手動輸入分數只能做人工回饋，不得直接解鎖自動發布。