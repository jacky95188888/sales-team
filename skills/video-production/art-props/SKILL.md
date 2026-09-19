# Art & Props Skill V2 — Production Design for AI Short-form

## Mission
把導演意圖轉成可生成、可拍、可剪、可驗證的場景、美術、道具、服裝、產品 UI 與 B-roll 設計。目標不是「把背景塞滿」，而是讓每個物件、材質、色彩、光源與畫面層次都服務故事、品牌與產品證據，避免白底 Avatar、廉價模板與 generic motion graphics。

## Evidence Basis
### Professional production-design practice
- 先由故事與角色決定 environment、palette、materials、props、wardrobe、set dressing，再決定裝飾；禁止反過來用漂亮素材拼故事。
- Hero prop / product / UI 必須在畫面中有明確功能、位置、尺度、互動方式與 continuity。
- Production design 必須與 Director、Cinematography 共用 visual hierarchy、色彩、材質、光線動機與空間連續性。
- 美術不能遮蔽人物表情、產品操作、字幕安全區或 CTA。

### Market evidence
美女顧問團正式任務讀取 `referenceBrief` 的 set density、prop usage、product-proof pattern、B-roll categories、graphic density、palette relationship，但只學抽象結構，不複製單一影片的獨特場景、角色造型或美術表達。

### First-party learning
發布後將 Visual QC、觀眾留存、產品畫面停留區段、留言反應與修鏡原因寫回 Learning Memory。若某種背景/材質/道具反覆造成 morphing、文字破損、手物變形或 UI corruption，降低其生成優先級。

## Inputs
- script
- directorPlan
- cinematographyPlan
- Character Bible
- Visual Bible
- Brand Bible
- authorized Asset Library
- real product/UI assets
- referenceBrief（美女顧問團正式任務）

## Visual Hierarchy
每鏡必須標示：
1. `primarySubject`：觀眾第一眼必須看到什麼。
2. `secondarySubject`：第二層資訊。
3. `backgroundRole`：背景的故事功能。
4. `negativeSpace`：字幕/UI/視線需要的空間。
5. `proofElement`：真實產品、UI、數據或實物證據；無需要時標 null。

## Set Design
每個 set 定義：
- storyPurpose
- locationType
- palette
- materialLanguage
- foreground / midground / background layers
- practicalLightSources
- textureTargets
- atmosphere
- heroObjects
- prohibitedObjects
- continuityKey

禁止：
- 無理由純白/純色背景佔正式母片主要篇幅。
- 用 generic motion graphics 假裝場景或 B-roll。
- 每鏡換完全不同美術世界造成品牌/角色漂移。
- 過度裝飾讓產品、臉或 CTA 失焦。

## Props
每個重要道具必須有：
- `propId`
- `storyFunction`
- `ownerCharacter`
- `material`
- `sizeRelationship`
- `screenPosition`
- `interaction`
- `continuityState`
- `generationRisk`

Hero prop 在跨鏡頭出現時必須保持顏色、尺寸、形狀、文字/logo、磨損狀態與左右手關係一致。

## Product / UI Proof Rules
- 有真實產品/UI素材時優先使用授權原始素材，不重新生成假 UI。
- 網站/APP 畫面要可辨識核心操作，不得讓 AI 改字、亂碼、重畫 logo 或捏造不存在功能。
- UI 動畫可做 push-in、highlight、callout、cursor/tap emphasis，但不能遮掉真實證據。
- 無真實證據時不得生成假的「使用者數據」「營收」「評價」「後台成果」冒充真實畫面。

## Wardrobe / Character Styling
每位固定員工依 Character/Visual Bible 維持：
- silhouette
- primary wardrobe family
- accessory rules
- hair continuity
- makeup intensity
- brand compatibility

同一場景 continuity 內不得無理由換衣、換髮型、換飾品、換臉部特徵。

## AI Material Quality
Premium 目標必須描述可驗收材質，而非只寫 cinematic / luxury：
- skin: natural pores / non-waxy
- fabric: weave / fold / weight
- metal: controlled specular reflection
- glass: plausible refraction/reflection
- wood/stone: non-repeating natural texture
- food/liquid: physical volume, moisture, viscosity, gravity
- screen/UI: sharp, stable, readable

## High-risk Interaction Rules
以下鏡頭提高 generationRisk 並要求 Visual QC 密集採樣：
- 手拿小物/餐具/手機
- 倒液體、切食物、吃東西
- 多人接觸或交接物件
- 鏡面/玻璃/反射
- 螢幕文字與 UI
- 精細 logo / 品牌字樣
- 複雜飾品與手指重疊

高風險畫面若不是故事必要，優先改成 insert、cutaway、locked close-up 或使用真實素材；不要為炫技增加生成失敗率。

## B-roll Standard
有效 B-roll 必須至少完成一項：
- 提供產品/操作證據
- 推進故事
- 建立空間/情緒
- 解釋抽象資訊
- 隱藏必要剪接並保持敘事連續

只有漂浮粒子、抽象線條、隨機城市、無關鍵盤、generic AI 科技背景不算有效 B-roll，除非劇情有明確用途。

## Route Presets
### 天衡
東方神秘 × 未來科技 × 真實命盤/UI。材質優先深色木、紙、墨、金屬細節、低飽和光源與精緻 HUD；禁止廉價紫色宇宙、滿版八卦符號、亂飛金光取代真實產品。

### 美女顧問團
精品商業短片 × 微短劇 × 現代工作場景。優先真實桌面、手機/筆電產品操作、質感辦公/生活空間、角色專屬道具、data card 與實際畫面；禁止整片白棚 Avatar + 模板圖卡。

## Reject Codes
- `generic_set`
- `generic_motion_graphics`
- `prop_continuity_break`
- `wardrobe_identity_drift`
- `fake_product_ui`
- `text_logo_corruption`
- `visual_clutter`
- `no_product_proof`
- `material_texture_failure`
- `hand_object_risk_unmanaged`
- `brand_visual_mismatch`

## Cost / Repair Strategy
- 先做 asset inventory 與 art plan，再付費生成。
- 能使用授權真實 UI/產品素材就不重新生成。
- 道具或背景單點錯誤優先局部修鏡/替換 layer。
- 只有整體 visual world 不成立才回 Director 重新設計，不以全片重生作第一選項。

## Output
```json
{
  "status":"PASS|REVISION_REQUIRED|REFERENCE_REQUIRED|ASSET_REQUIRED",
  "evidenceBasis":{},
  "visualHierarchy":[],
  "sets":[],
  "props":[],
  "wardrobe":[],
  "productUiAssets":[],
  "brollPlan":[],
  "materialTargets":[],
  "highRiskInteractions":[],
  "continuityKeys":[],
  "visualQcSamplingHints":[],
  "repairRequests":[]
}
```

## Handoff
- PASS → Generation + Editor + Visual QC。
- 缺真實產品/UI → `ASSET_REQUIRED`，回 Asset Library/Producer。
- 場景與劇情不匹配 → 回 Director。
- 高風險互動無法穩定生成 → 與 Cinematography 改鏡位/拆鏡。

## Production-ready Definition
缺少 `evidenceBasis`、visual hierarchy、set/prop continuity、真實產品/UI策略、B-roll plan、高風險標記任一核心項，只能標 DRAFT，不得進正式自動發布。