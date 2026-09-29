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
      var d = await post("/threads-growth/status", {}, false);
      var box = el("threadsGateReady");
      if (box) box.innerHTML =
        '<div class="out"><b>執行狀態</b><br>' +
        (d.approvalConfigured ? '✅ PIN 安全閘門已設定' : '❌ PIN 安全閘門未設定') + '<br>' +
        (d.oauthConnected ? '✅ Threads 官方授權已連線' : '⚠️ Threads 尚未完成官方授權') + '<br>' +
        (d.livePublishEnabled ? '🟢 正式發布已開啟' : '🟡 正式發布預設關閉') + '<br>' +
        (d.autonomousResearchEnabled ? '🤖 每日上午自動找題研究，不必先下主題' : '⚠️ 自動研究未開啟') + '<br>' +
        (d.latestResearch ? '📝 最近研究：' + esc(d.latestResearch.date) + '，候選 ' + Number(d.latestResearch.candidateCount||0) + ' 題／待審草稿 ' + Number(d.latestResearch.draftCount||0) + ' 份<br>' : '') +
        '✅ 安全測試可用</div>';
    } catch(e) { var box=el("threadsGateReady"); if(box) box.innerHTML='<div class="err">'+esc(e.message)+'</div>'; }
  }
  async function refresh() {
    readiness();
    try {
      status("正在讀取待審核草稿…");
      var d = await post("/threads-growth/drafts", {}, true);
      cache = d.drafts || []; renderDrafts(); status("已更新。正式發布仍需你親自按下確認。");
    } catch(e) { status(e.message, true); }
  }
  async function createDraft() {
    var topic = (el("threadsGateTopic").value || "").trim();
    var context = (el("threadsGateContext").value || "").trim();
    if (!topic) return status("請先填一個題目。", true);
    try {
      status("AI 正在產生 Threads 草稿；這一步不會發布。");
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
      '<div class="hint">AI 可以研究與寫草稿，但不能自己公開發文。只有你輸入執行 PIN、查看內容並按「正式發布」才會送出。</div></div>'+
      '<section class="panel"><b>建立待審核草稿</b><input id="threadsGateTopic" placeholder="例如：一人公司如何用 AI 減少重複工作" style="margin-top:8px"><textarea id="threadsGateContext" placeholder="補充資料（可留白）" style="margin-top:8px;min-height:90px"></textarea><button class="btn" id="threadsGateDraft" type="button">產生草稿（不發布）</button></section>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn2" id="threadsGateRefresh" type="button">更新審核清單</button><button class="copy" id="threadsGateChangePin" type="button">重新輸入 PIN</button></div>'+
      '<div id="threadsGateReady"></div><div id="threadsGateStatus"></div><div id="threadsGateDrafts"></div>';
    wrap.appendChild(page);
    var nav=el("navbar"); if(nav){ var n=document.createElement("button"); n.setAttribute("data-p","threads_gate"); n.innerHTML='<span class="ic">🛡️</span>脆審核'; nav.appendChild(n); }
    el("threadsGateDraft").onclick=createDraft;
    el("threadsGateRefresh").onclick=refresh;
    el("threadsGateChangePin").onclick=function(){ sessionStorage.removeItem(KEY); approvalKey(true); refresh(); };
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount); else mount();
}());
