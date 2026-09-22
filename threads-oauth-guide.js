/* 美女顧問團・Threads 一次完成授權卡
 * 把 Meta 建 App、Cloudflare 設定與官方 OAuth 集中在同一個手機頁面。
 * 使用者不需回聊天室逐步索取網址或欄位名稱。
 */
(function () {
  "use strict";

  var WORKER = window.WORKER_URL || "https://sales-team.rhtm9y855y.workers.dev";
  var REDIRECT = WORKER + "/threads-growth/oauth/callback";
  var PROGRESS_KEY = "advisor_threads_oauth_guide_v1";
  var STEPS = ["meta", "cloudflare", "oauth", "test"];

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
  function read() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function save(v) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(v)); } catch (_) {} }
  function done(id, checked) {
    var state = read(); state[id] = checked !== false; save(state); renderProgress();
  }
  function copy(text, button) {
    function ok() { if (button) { var old = button.textContent; button.textContent = "已複製 ✓"; setTimeout(function () { button.textContent = old; }, 1500); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok).catch(function () { window.prompt("請複製以下內容", text); });
    else window.prompt("請複製以下內容", text);
  }
  function card(num, title, body) {
    return '<section class="panel" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:flex-start"><span class="stepnum" style="width:26px;height:26px;flex:0 0 26px;font-size:.86rem">' + num + '</span><div style="min-width:0;flex:1"><div style="font-weight:800;color:var(--gold-lt);font-size:1rem;margin-bottom:5px">' + title + '</div>' + body + '</div></div></section>';
  }
  function renderProgress() {
    var state = read(), count = STEPS.filter(function (k) { return state[k]; }).length;
    var out = el("threadsGuideProgress");
    if (out) out.innerHTML = '<div class="ceobar"><span class="crown">◉</span><span>目前完成 <b style="color:var(--gold-lt)">' + count + ' / 4</b> 步。這張卡會記住進度，你可直接一路做完。</span></div>';
    STEPS.forEach(function (key) { var box = el("tg_" + key); if (box) box.checked = !!state[key]; });
  }
  function setStatus(message, error) {
    var out = el("threadsOauthStatus"); if (!out) return;
    out.innerHTML = '<div class="' + (error ? "err" : "out") + '">' + esc(message) + '</div>';
  }
  async function startOAuth() {
    setStatus("正在向美女顧問團確認 Threads 設定…");
    try {
      var response = await fetch(WORKER + "/threads-growth/oauth-start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.authorizationUrl) {
        if (String(data.error || "").indexOf("THREADS_APP_CONFIG_REQUIRED") >= 0) {
          setStatus("Cloudflare 的 Threads 三個欄位尚未填完。請先完成第 2 步，再按一次這個按鈕。", true);
        } else setStatus("尚未能啟動授權：" + (data.error || "請確認 Cloudflare Worker 已部署最新 main"), true);
        return;
      }
      done("oauth");
      window.location.assign(data.authorizationUrl);
    } catch (_) { setStatus("連不上 Worker。請確認網路後再按一次；不會重置你的進度。", true); }
  }
  function render() {
    var tabs = el("tabs");
    if (!tabs || el("p_threads_setup")) return;
    var button = document.createElement("button");
    button.setAttribute("data-p", "threads_setup"); button.textContent = "🧷 脆授權";
    tabs.appendChild(button);

    var page = document.createElement("div");
    page.className = "page"; page.id = "p_threads_setup";
    page.innerHTML =
      '<div class="panel" style="background:linear-gradient(145deg,rgba(76,45,118,.98),rgba(32,20,58,.98))">' +
        '<div style="font-size:1.2rem;font-weight:900;color:var(--gold-lt)">🧷 Threads 授權一次完成</div>' +
        '<div class="hint" style="font-size:.82rem">只處理 Threads 文字自動發文。不開短影片、YouTube、TikTok 或 HeyGen。照 1→4 做完即可，不必每一步回聊天室。</div>' +
        '<div id="threadsGuideProgress" style="margin-top:12px"></div>' +
      '</div>' +
      card("1", "登入 Meta 開發者後台", 
        '<div class="small">請使用<strong style="color:var(--gold-lt)">綁定 Threads 的 Facebook 帳號</strong>登入；不用建立新 Meta 商業帳號。</div>' +
        '<a class="btn btn2" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener">開啟 Meta Developers ↗</a>' +
        '<div class="hint">建立 App：名稱填「美女顧問團 Threads Growth」→ 選 Threads API。看到 App Dashboard 後即可勾選完成。</div>' +
        '<label class="pick"><input id="tg_meta" type="checkbox">我已建立或開啟 Threads App</label>') +
      card("2", "一次填好 Cloudflare 設定", 
        '<div class="small">到 Cloudflare → Workers & Pages → <b>sales-team</b> → Settings → Variables and Secrets。新增下列 3 個值；前兩個設為 Secret。</div>' +
        '<div class="out" style="font-size:.8rem;margin-top:9px"><b>THREADS_APP_ID</b>　Meta App 的 App ID<br><b>THREADS_APP_SECRET</b>　Meta App 的 App Secret<br><b>THREADS_REDIRECT_URI</b><br><span id="tg_redirect">' + esc(REDIRECT) + '</span></div>' +
        '<button class="copy" type="button" id="tg_copy_redirect">複製 Redirect URI</button>' +
        '<a class="btn btn2" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="https://dash.cloudflare.com/" target="_blank" rel="noopener">開啟 Cloudflare ↗</a>' +
        '<div class="hint">同一條 Redirect URI 也要貼回 Meta App 的 OAuth redirect 設定。填完後按 Cloudflare 的部署／儲存。</div>' +
        '<label class="pick"><input id="tg_cloudflare" type="checkbox">三個欄位已儲存並部署</label>') +
      card("3", "一鍵正式連接 Threads", 
        '<div class="small">這一步會跳到 Threads 官方同意頁，請按「允許」。完成後會自動回到成功頁；不需要貼 Token 或密碼給我。</div>' +
        '<button class="btn" id="tg_start_oauth" type="button">開始官方 Threads 授權 ▶</button>' +
        '<label class="pick"><input id="tg_oauth" type="checkbox">我已看到「Threads 授權完成」</label>') +
      card("4", "回到顧問團做安全測試", 
        '<div class="small">回「執行官」選 Threads，產一篇草稿後先審核，再按安全測試。它只驗證文字，不會發出公開貼文。</div>' +
        '<button class="btn btn2" id="tg_to_execute" type="button">前往執行官做安全測試</button>' +
        '<label class="pick"><input id="tg_test" type="checkbox">安全測試完成，尚未公開發文</label>') +
      '<div id="threadsOauthStatus"></div>';
    var nav = el("navbar");
    if (nav) {
      var navButton = document.createElement("button"); navButton.setAttribute("data-p", "threads_setup");
      navButton.innerHTML = '<span class="ic">🧷</span>脆授權'; nav.appendChild(navButton);
    }
    document.querySelector(".wrap").appendChild(page);

    ["meta", "cloudflare", "oauth", "test"].forEach(function (key) {
      var checkbox = el("tg_" + key); if (checkbox) checkbox.addEventListener("change", function () { done(key, checkbox.checked); });
    });
    el("tg_copy_redirect").addEventListener("click", function () { copy(REDIRECT, this); });
    el("tg_start_oauth").addEventListener("click", startOAuth);
    el("tg_to_execute").addEventListener("click", function () {
      var target = document.querySelector('[data-p="execute"]'); if (target) target.click();
    });
    renderProgress();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
}());
