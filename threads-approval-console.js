/* 美女顧問團・Threads 人工執行閘門
 * 手機優先：研究/草稿可以自動，批准與正式發布必須由人操作。
 * APPROVAL_KEY 只保存在 sessionStorage，不寫入 repo/localStorage。
 */
(function () {
  "use strict";
  var WORKER = window.WORKER_URL || "https://sales-team.rhtm9y855y.workers.dev";
  var KEY = "threadsApprovalKeyV1";
  var cache = [];

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function approvalKey(force) {
    var key = force ? "" : (sessionStorage.getItem(KEY) || "");
    if (!key) {
      key = window.prompt("輸入 Threads 執行閘門 PIN（只記住這次開啟期間）") || "";
      if (key) sessionStorage.setItem(KEY, key);
    }
    return key;
  }
  function status(msg, bad) {
    var out = el("threadsGateStatus");
    if (out) out.innerHTML = '<div class="' + (bad ? "err" : "out") + '">' + esc(msg) + "</div>";
  }
  async function post(path, body, protectedAction) {
    var headers = {"Content-Type":"application/json"};
    if (protectedAction) {
      var key = approvalKey(false);
      if (!key) throw new Error("需要執行閘門 PIN");
      headers["X-Approval-Key"] = key;
    }
    var r = await fetch(WORKER + path, {method:"POST", headers:headers, body:JSON.stringify(body || {})});
    var d = await r.json().catch(function(){ return {}; });
    if (!r.ok) {
      if (r.status === 401) sessionStorage.removeItem(KEY);
      throw new Error(d.error || ("HTTP " + r.status));
    }
    return d;
  }
  function badge(s) {
    var map={pending_review:"待審核",approved:"已批准",rejected:"已拒絕",published:"已發布",publishing:"發布中"};
    return map[s] || s || "未知";
  }
  function renderDrafts() {
    var box = el("threadsGateDrafts"); if (!box) return;
    if (!cache.length) { box.innerHTML='<div class="hint">目前沒有可審核草稿。</div>'; return; }
    box.innerHTML = cache.map(function(x,i){
      var text=String(x.post||"");
      var buttons = x.status === "pending_review"
        ? '<button class="btn tgApprove" data-i="'+i+'">批准</button><button class="btn btn2 tgReject" data-i="'+i+'">拒絕</button>'
        : x.status === "approved"
          ? '<button class="btn btn2 tgDry" data-i="'+i+'">安全測試</button><button class="btn tgPublish" data-i="'+i+'">正式發布</button>'
          : "";
      return '<section class="panel" style="margin:10px 0">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="color:var(--gold-lt)">'+esc(x.topic||"Threads 草稿")+'</b><span class="small">'+esc(badge(x.status))+'</span></div>'+
        '<details style="margin-top:8px"><summary>查看 AI 建議／完整草稿</summary><div class="out" style="white-space:pre-wrap;margin-top:8px">'+esc(text)+'</div></details>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+buttons+'</div></section>';
    }).join("");
    box.querySelectorAll(".tgApprove").forEach(function(b){ b.onclick=function(){ review(cache[+b.dataset.i], true); }; });
    box.querySelectorAll(".tgReject").forEach(function(b){ b.onclick=function(){ review(cache[+b.dataset.i], false); }; });
    box.querySelectorAll(".tgDry").forEach(function(b){ b.onclick=function(){ dry(cache[+b.dataset.i]); }; });
    box.querySelectorAll(".tgPublish").forEach(function(b){ b.onclick=function(){ publish(cache[+b.dataset.i]); }; });
  }
  async function readiness() {
    try {
      var d = await post("/threads-growth/status", {}, true);
      var box = el("threadsGateReady");
      if (box) box.innerHTML =
        (d.todaySummary ? '<div class="out"><b>📊 今日顧問團摘要｜'+esc(d.todaySummary.date||"")+'</b><br>' +
          (d.todaySummary.researched ? '✅ 已完成今日研究' : '⏳ 今日尚未研究') + '｜候選 '+Number(d.todaySummary.candidateCount||0)+' 題｜草稿 '+Number(d.todaySummary.draftCount||0)+' 份<br>' +
          '📝 待你審核 '+Number(d.todaySummary.pendingReviewCount||0)+' 份｜🚀 今日已發布 '+Number(d.todaySummary.publishedCount||0)+' 篇' +
          (Number(d.todaySummary.autoPublishedCount||0) ? '（全自動 '+Number(d.todaySummary.autoPublishedCount||0)+'）' : '') +
          '</div>' : '') +
        '<div class="out"><b>執行狀態</b><br>' +
        (d.approvalConfigured ? '✅ PIN 安全閘門已設定' : '❌ PIN 安全閘門未設定') + '<br>' +
        (d.oauthConnected ? '✅ Threads 官方授權已連線' : '⚠️ Threads 尚未完成官方授權') + '<br>' +
        (d.mode === 'auto' ? '🤖 模式：全自動（研究→寫稿→安全檢查→正式發布）' : '🛡️ 模式：經我同意（研究→寫稿→等待批准）') + '<br>' +
        (d.livePublishEnabled ? '🟢 正式發布已開啟' : '🟡 正式發布預設關閉') + '<br>' +
        (d.autonomousResearchEnabled ? '🤖 每日上午自動找題研究，不必先下主題' : '⚠️ 自動研究未開啟') + '<br>' +
        (d.latestResearch ? '📝 最近研究：' + esc(d.latestResearch.date) + '，候選 ' + Number(d.latestResearch.candidateCount||0) + ' 題／待審草稿 ' + Number(d.latestResearch.draftCount||0) + ' 份<br>' : '') +
        (d.latestResearchError ? '⚠️ 最近研究失敗（' + esc(d.latestResearchError.date||"") + '）：' + esc(d.latestResearchError.error||"") + '<br>' : '') +
        (d.latestAutoExecution ? '📡 最近自動執行：' + esc(d.latestAutoExecution.status||"") + (d.latestAutoExecution.topic ? '｜' + esc(d.latestAutoExecution.topic) : '') + '<br>' : '') +
        '✅ 安全測試可用</div>' +
        (Array.isArray(d.autoExecutionHistory) && d.autoExecutionHistory.length
          ? '<details class="out" style="margin-top:8px"><summary><b>📋 最近自動工作紀錄</b></summary>' +
            d.autoExecutionHistory.map(function(x){
              var when=x.at ? new Date(x.at).toLocaleString("zh-TW") : "";
              return '<div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)">' +
                esc(when) + '｜' + esc(x.status||"") + (x.topic ? '<br>'+esc(x.topic) : '') +
                (x.error ? '<br><span class="err">'+esc(x.error)+'</span>' : '') + '</div>';
            }).join("") + '</details>'
          : '');
    } catch(e) { var box=el("threadsGateReady"); if(box) box.innerHTML='<div class="err">'+esc(e.message)+'</div>'; }
  }
  async function setMode(mode) {
    var auto = mode === "auto";
    var msg = auto
      ? "切換成【全自動模式】後，顧問團研究出值得寫的內容，會自動安全檢查並在官方 Threads 授權有效時直接公開發布，不會逐篇等你批准。確定開啟？"
      : "切換成【經我同意模式】後，AI 仍會自動研究與寫草稿，但每篇都要等你批准後才能正式發布。確定切換？";
    if (!confirm(msg)) return;
    try {
      status("正在切換模式…");
      await post("/threads-growth/config", {action:"save", config:{mode:mode, livePublishEnabled:auto}}, true);
      await refresh();
      status(auto ? "已切換：全自動模式。" : "已切換：經我同意模式。");
    } catch(e) { status(e.message, true); }
  }
  async function researchNow() {
    try {
      var current = await post("/threads-growth/status", {}, true);
      var auto = current.mode === "auto";
      var prompt = auto
        ? "目前是【全自動模式】。立即研究後，顧問團會研究、討論、寫稿、安全檢查，符合條件且官方 Threads 授權有效時可能直接公開發布。確定執行？"
        : "目前是【經我同意模式】。立即研究只會研究、討論與產生待審草稿，不會自行公開發布。確定執行？";
      if (!confirm(prompt)) return;
      status(auto ? "顧問團正在研究；目前為全自動模式，合格內容可能直接發布。" : "顧問團正在研究，完成後會放進待審核。");
      var result = await post("/threads-growth/research-now", {}, true);
      await refresh();
      status(result.runStatus === "already_completed"
        ? "今天已研究過，直接顯示現有報告與待審草稿。"
        : "今日自動研究完成，請查看研究報告與待審草稿。");
    } catch(e) { status(e.message, true); }
  }
  async function researchReport() {
    try {
      var d = await post("/threads-growth/research", {}, true);
      var box = el("threadsGateResearch");
      if (!box) return;
      var report = d.report;
      if (!report || !Array.isArray(report.candidates) || !report.candidates.length) {
        box.innerHTML = '<div class="hint">今日自動研究尚未產生；排程會在上午自動執行。</div>';
        return;
      }
      box.innerHTML = '<section class="panel" style="margin:10px 0"><b style="color:var(--gold-lt)">🔎 最近自動研究報告｜' + esc(report.date||"") + '</b>' +
        '<div class="hint">顧問團自己找出的討論候選。你不用先下主題。</div>' +
        report.candidates.map(function(x,i){
          return '<div class="out" style="margin-top:8px"><b>'+(i+1)+'. '+esc(x.topic||"")+'</b>' +
            (x.angle ? '<br>切角：'+esc(x.angle) : '') +
            (x.whyNow ? '<br>現在值得談：'+esc(x.whyNow) : '') +
            (x.sourceHint ? '<br>來源提示：'+esc(x.sourceHint) : '') +
            (x.decision ? '<br><b>顧問團結論：'+esc(x.decision)+'</b>' : '') +
            (x.discussion && x.discussion.researcher ? '<br>🔬 研究員：'+esc(x.discussion.researcher) : '') +
            (x.discussion && x.discussion.strategist ? '<br>🧭 內容策略：'+esc(x.discussion.strategist) : '') +
            (x.discussion && x.discussion.riskReviewer ? '<br>🛡️ 風險檢查：'+esc(x.discussion.riskReviewer) : '') +
            (x.risk ? '<br>風險：'+esc(x.risk) : '') + '</div>';
        }).join("") + '</section>';
    } catch(e) {
      var box=el("threadsGateResearch");
      if(box) box.innerHTML='<div class="err">'+esc(e.message)+'</div>';
    }
  }
  async function refresh() {
    try {
      // Ask once before launching protected reads. Without this, parallel status,
      // research and draft requests can each open their own PIN prompt on mobile.
      var key = approvalKey(false);
      if (!key) throw new Error("需要執行閘門 PIN");
      status("正在更新今日摘要、研究報告與待審核草稿…");
      var results = await Promise.all([
        readiness(),
        researchReport(),
        post("/threads-growth/drafts", {}, true)
      ]);
      var d = results[2] || {};
      cache = d.drafts || [];
      renderDrafts();
      status("已更新。後續是否自動發布，依你目前選擇的運作模式。");
    } catch(e) { status(e.message, true); }
  }
  async function createDraft() {
    var topic = (el("threadsGateTopic").value || "").trim();
    var context = (el("threadsGateContext").value || "").trim();
    if (!topic) return status("請先填一個題目。", true);
    try {
      status("AI 正在處理這個題目；是否直接發布會依目前運作模式決定。");
      await post("/threads-growth/draft", {topic:topic, context:context}, false);
      await refresh();
    } catch(e) { status(e.message, true); }
  }
  async function review(item, approved) {
    if (!approved && !confirm("確定拒絕這份草稿？")) return;
    if (approved && !confirm("批准這份草稿進入可執行狀態？這一步仍不會公開發布。")) return;
    try {
      await post("/threads-growth/approve", {draftId:item.id, approved:approved}, true);
      await refresh();
    } catch(e) { status(e.message, true); }
  }
  async function dry(item) {
    try {
      var d=await post("/threads-growth/test-publish", {draftId:item.id}, false);
      status(d.message || "安全測試完成，沒有公開發布。");
    } catch(e) { status(e.message, true); }
  }
  async function publish(item) {
    if (!confirm("最後確認：現在要把這篇文字正式發布到 Threads？")) return;
    try {
      status("正在執行你剛批准的 Threads 發布…");
      await post("/threads-growth/publish", {draftId:item.id}, true);
      await refresh(); status("Threads 已完成發布。");
    } catch(e) {
      if (String(e.message).includes("THREADS_LIVE_PUBLISH_DISABLED") && confirm("正式發布開關目前關閉。要現在開啟後再發布這篇嗎？")) {
        try {
          await post("/threads-growth/config", {action:"save", config:{livePublishEnabled:true}}, true);
          await post("/threads-growth/publish", {draftId:item.id}, true);
          await refresh(); status("Threads 已完成發布。"); return;
        } catch(e2) { return status(e2.message, true); }
      }
      status(e.message, true);
    }
  }
  function mount() {
    var tabs=el("tabs"), wrap=document.querySelector(".wrap");
    if (!tabs || !wrap || el("p_threads_gate")) return;
    var tab=document.createElement("button"); tab.setAttribute("data-p","threads_gate"); tab.textContent="🛡️ 脆審核"; tabs.appendChild(tab);
    var page=document.createElement("div"); page.className="page"; page.id="p_threads_gate";
    page.innerHTML=
      '<div class="panel" style="background:linear-gradient(145deg,rgba(76,45,118,.98),rgba(32,20,58,.98))">'+
      '<div style="font-size:1.2rem;font-weight:900;color:var(--gold-lt)">🛡️ Threads AI 執行閘門</div>'+
      '<div class="hint">你可以選兩種模式：全自動，或每篇經你同意。模式切換本身一定需要 PIN。</div></div>'+
      '<section class="panel"><b>運作模式</b><div class="hint">全自動：設定一次後自己研究、討論、寫稿、安全檢查並發布。經我同意：研究與寫稿自動，但發布前等你批准。</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="threadsModeAuto" type="button">🤖 全自動模式</button><button class="btn btn2" id="threadsModeReview" type="button">🛡️ 經我同意模式</button></div></section>'+
      '<section class="panel"><b>建立待審核草稿</b><input id="threadsGateTopic" placeholder="例如：一人公司如何用 AI 減少重複工作" style="margin-top:8px"><textarea id="threadsGateContext" placeholder="補充資料（可留白）" style="margin-top:8px;min-height:90px"></textarea><button class="btn" id="threadsGateDraft" type="button">產生草稿（不發布）</button></section>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="threadsGateResearchNow" type="button">🔎 立即研究今天題目</button><button class="btn btn2" id="threadsGateRefresh" type="button">更新審核清單</button><button class="copy" id="threadsGateChangePin" type="button">重新輸入 PIN</button></div>'+
      '<div id="threadsGateReady"></div><div id="threadsGateResearch"></div><div id="threadsGateStatus"></div><div id="threadsGateDrafts"></div>';
    wrap.appendChild(page);
    var nav=el("navbar"); if(nav){ var n=document.createElement("button"); n.setAttribute("data-p","threads_gate"); n.innerHTML='<span class="ic">🛡️</span>脆審核'; nav.appendChild(n); }
    el("threadsModeAuto").onclick=function(){ setMode("auto"); };
    el("threadsModeReview").onclick=function(){ setMode("review"); };
    el("threadsGateDraft").onclick=createDraft;
    el("threadsGateResearchNow").onclick=researchNow;
    el("threadsGateRefresh").onclick=refresh;
    el("threadsGateChangePin").onclick=function(){ sessionStorage.removeItem(KEY); approvalKey(true); refresh(); };
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount); else mount();
}());
