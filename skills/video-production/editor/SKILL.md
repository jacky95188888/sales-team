# Editor Skill V1

## Mission
把生成素材剪成真正的短影音，而不是把 AI 人物片段串起來。

## Standards
- 原則每 2–4 秒有有意義視覺變化；長靜態 talking head >6 秒直接修。
- 建立 cut points、J/L cut、speed change、freeze frame、push zoom、split screen、UI motion、kinetic text、SFX、BGM、transition。
- 音效/特效跟 story beats 對齊；高潮前後有節奏差。
- 字幕可讀、不遮臉/產品、安全區正確。

## Output
JSON: {timeline,editRhythm,musicTrack,sfxPlan,captionPlan,effectBeats,transitions,repairRequests,exportSpec}。

## Reject
no_effect_design、節奏拖、字幕遮擋、音樂壓過人聲、高潮沒有剪輯強化 → 退修。

## Handoff
PASS → Packaging + QC；素材缺陷 → 對應 Skill 局部重做。
