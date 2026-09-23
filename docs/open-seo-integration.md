# Open SEO Advisor 整合審查

來源：https://github.com/mars-tw/open-seo-advisor-skill

本次以 sales-team 的完整首頁原檔新增獨立入口；沒有安裝第三方 skill、執行安裝腳本或更改 Worker。新頁面是瀏覽器工具，沒有上傳、爬取外部網址、AI、HeyGen、發布或廣告花費呼叫。

## 核對結果

- `scripts/seo_advisor/growth/utm.py`（blob ac081f6405773ca23026983f7eef2369f93e241f）：UTM 已實作。新版本以 URLSearchParams 重寫，保留非 UTM 重複參數與錨點；新增 Threads，自然宣傳不標成付費廣告。同一 campaign 跨平台是正常用途，不照搬原版跨來源警告。
- `scripts/seo_advisor/growth/cro.py`（blob e3a9fd5194f854f9dfda7bf8cff9e4b72af3ec57）：以 HTML 啟發式檢查 CTA、表單、信任文字等；不是實際轉換成效。我們只採用可提供證據的靜態檢查，不因沒表單就認定缺陷、不以「保證」等字詞判定可信、不把資源數量當速度測量、不補湊問題數。
- `scripts/seo_advisor/growth/providers/google.py`（blob a1dc0270e014abcf70a720416a16395fe6bc3e91）：GA4/GSC/Google Ads 的 fetch_metrics 明確拋出尚未實作。故不顯示已連線、假流量或模擬收益。
- `docs/methodology.md`：通用內容與實驗方法可以轉成人工清單；無法保證成效。

## 已納入

1. 五平台自然宣傳連結產生與複製。
2. 使用者匯入 HTML 的靜態檢查：title、description、H1、alt、canonical、noindex、CTA 文字。
3. 六項人工內容檢核與 JSON 匯出，永遠標示 draft / publishingApproved:false。
4. 圖片、腳本、iframe 不掛載至頁面；template inert 解析與 CSP 雙重限制。

這份檢查不涵蓋 HTTP 狀態、robots.txt、sitemap、Core Web Vitals、動態 DOM、搜尋排名或實際流量。CSP connect-src none 阻止 API 呼叫；原始檔內容不寫入 localStorage。變更輸入會清除舊結果。

## 授權與修改

參考來源作者 mars-tw / Open SEO Advisor，Apache License 2.0；完整授權見 `vendor/open-seo-advisor/LICENSE`。上游根目錄未列出 NOTICE。此整合為 JavaScript 重寫與方法改編，非原 Python 工具的完整移植，不表示原作者背書。修改內容列於本文件與程式檔頭。

## 驗證

`node --test tests/growth-tools.test.mjs`

GitHub Actions 已通過，測試對應程式提交 `cc12ea4577f08d967d05de3081e40289da7068b1`：
https://github.com/jacky95188888/sales-team/actions/runs/35806711225

- Node 邏輯測試 2 項、JavaScript 語法檢查通過。
- Chromium 390px 手機與 1280px 桌面版無水平溢出。
- 產生五平台追蹤網址，保留既有網址參數與錨點。
- 匯入包含 script、img、iframe 的 HTML：無腳本執行、零外部請求。
- 六項檢核與下載記錄通過，記錄仍是 draft，沒有發布授權。
- 修改活動或更換 HTML 檔後，舊結果失效。

本機 Chromium 下載失敗，上述瀏覽器驗證由 GitHub Actions 完成；尚未實測 iPhone Safari。這次收尾只更新文件，不變更已驗證的程式。

## 使用與上線狀態

目前為待審查版本，未合併、未部署，正式站不會出現此入口。
上線後入口為首頁「網站成長工具」，依序填正式網址、活動代號（例如 sanbao_launch_2026）、素材代號（例如 post_a），產生並複製各平台連結。UTM 只負責標記，目的站需另有分析工具才能看來源成效。

HTML 檢查需匯入原始 HTML 檔案，不接受截圖或只輸入網址；勾選人工清單後可下載本次 JSON 審核紀錄。關閉頁面前需自行匯出，未保存內容不會跨裝置同步。

未納入：真實 GA4/GSC 串接、Worker 自動預審、影片品質閘門接線、自動發布。
