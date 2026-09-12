/* ============================================================
 * 三寶爸 AI 一人公司 — 營運總部 V2
 * ------------------------------------------------------------
 * 以附加頁方式串接現有 /content、/execute 能力，不覆寫原功能。
 * 任務、產品快照與產出先存於本機；正式跨裝置排程需 Worker 支援。
 * ============================================================ */
(function () {
  "use strict";

  var KEY = "advisor_hq_tasks_v1";
  var WORKSPACE_KEY = "advisor_hq_workspace_v1";
  var currentRunId = null;
  var cloudBusy = false;
  var CHANNELS = [
    { id: "thread", label: "Threads 貼文" },
    { id: "fb", label: "Facebook 長文" },
    { id: "video", label: "短影音腳本" },
    { id: "line", label: "LINE 訊息" }
  ];

  function E(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function read() {
    try {
      var rows = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function write(rows) {
    try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 80))); return true; }
    catch (_) { return false; }
  }
  function nowText(t) {
    var d = new Date(t || Date.now());
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function dayKey(t) {
    var d = new Date(t || Date.now());
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function uid() { return "hq_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7); }
  function workspaceId() {
    var id = "";
    try { id = localStorage.getItem(WORKSPACE_KEY) || ""; } catch (_) {}
    if (id.length >= 24) return id;
    var bytes = new Uint8Array(18);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    id = "sanbao_" + Array.from(bytes).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    try { localStorage.setItem(WORKSPACE_KEY, id); } catch (_) {}
    return id;
  }
  function currentProduct() {
    try { return typeof currentProductObj === "function" ? currentProductObj() : null; }
    catch (_) { return null; }
  }
  function productSnapshot() {
    var p = currentProduct();
    if (!p) return null;
    return {
      name: p.p_name || "",
      feature: p.p_feat || "",
      price: p.p_price || "",
      audience: p.p_audience || "",
      industry: p.p_industry || "",
      contact: p.p_contact || "",
      url: p.p_url || ""
    };
  }
  function stateLabel(s) {
    return {
      queued: "等待啟動", strategy: "策略規劃中", producing: "內容製作中",
      reviewing: "AI 品質審核中", revising: "內容員自動修改中", approval: "等待你批准", returned: "退回修改",
      scheduled: "已批准排程", done: "已完成", failed: "需要處理"
    }[s] || s;
  }
  function findTask(id) { return read().find(function (x) { return x.id === id; }); }
  function updateTask(id, patch) {
    var rows = read();
    var i = rows.findIndex(function (x) { return x.id === id; });
    if (i < 0) return null;
    rows[i] = Object.assign({}, rows[i], patch, { updatedAt: Date.now() });
    write(rows); remoteUpsert(rows[i]); return rows[i];
  }

  function cloudState(text, bad) {
    var el = document.getElementById("hqCloudState");
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? "#ffaaa4" : "#91d7b4";
  }
  function remoteUpsert(task) {
    if (!task || typeof callAPI !== "function") return;
    callAPI("/hq-tasks", { action: "upsert", workspaceId: workspaceId(), task: task })
      .then(function () { cloudState("☁️ 雲端任務已同步"); })
      .catch(function () { cloudState("⚠️ 雲端暫時未同步，本機資料仍保留", true); });
  }
  function remoteDelete(taskId) {
    if (typeof callAPI !== "function") return;
    callAPI("/hq-tasks", { action: "delete", workspaceId: workspaceId(), taskId: taskId })
      .then(function () { cloudState("☁️ 雲端任務已刪除"); })
      .catch(function () { cloudState("⚠️ 雲端刪除稍後重試", true); });
  }
  function syncConfig() {
    if (typeof callAPI !== "function") return Promise.resolve();
    var product = productSnapshot();
    if (!product) {
      cloudState("⚠️ 設定產品後才會啟用每日自動任務", true);
      return Promise.resolve();
    }
    return callAPI("/hq-config", {
      action: "save",
      workspaceId: workspaceId(),
      autoEnabled: true,
      profile: typeof getProfile === "function" ? getProfile() : {},
      product: product,
      channels: ["thread", "fb", "video"]
    }).then(function () {
      cloudState("☁️ 雲端同步完成・每日自動營運已開啟");
    }).catch(function () {
      cloudState("⚠️ 自動營運設定尚未同步", true);
    });
  }
  function remoteHydrate(replaceLocal) {
    if (cloudBusy || typeof callAPI !== "function") return Promise.resolve();
    cloudBusy = true;
    return callAPI("/hq-tasks", { action: "list", workspaceId: workspaceId() })
      .then(function (data) {
        var remote = Array.isArray(data.tasks) ? data.tasks : [];
        var merged = replaceLocal ? remote.slice() : read().concat(remote);
        var seen = {};
        merged = merged.sort(function (a, b) { return Number(b.updatedAt || b.createdAt) - Number(a.updatedAt || a.createdAt); })
          .filter(function (x) { if (!x || !x.id || seen[x.id]) return false; seen[x.id] = true; return true; });
        write(merged);
        cloudState("☁️ 雲端同步完成・" + remote.length + " 件任務");
        render();
      }).catch(function () {
        cloudState("⚠️ 雲端讀取失敗，目前使用本機任務", true);
      }).finally(function () { cloudBusy = false; });
  }

  function addStyles() {
    if (document.getElementById("hqStyles")) return;
    var style = document.createElement("style");
    style.id = "hqStyles";
    style.textContent = `
      .hq-hero{background:linear-gradient(145deg,rgba(64,43,102,.96),rgba(28,19,51,.96));border:1px solid rgba(232,194,103,.45);border-radius:18px;padding:16px;margin-bottom:14px;box-shadow:0 10px 28px rgba(0,0,0,.34)}
      .hq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.hq-head h2{font-size:1.12rem;color:var(--gold-lt);line-height:1.35}.hq-head p{font-size:.74rem;color:var(--ink-soft);margin-top:2px}.hq-live{font-size:.72rem;color:#91d7b4;border:1px solid rgba(145,215,180,.3);background:rgba(40,110,78,.16);border-radius:99px;padding:5px 9px;white-space:nowrap}
      .hq-product{display:flex;align-items:center;gap:7px;margin-top:12px;padding:9px 11px;border-radius:11px;background:rgba(20,13,38,.5);font-size:.78rem;color:var(--ink-soft)}.hq-product b{color:var(--gold-lt)}
      .hq-points{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.hq-point{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:9px 8px;text-align:center}.hq-point b{display:block;color:var(--gold-lt);font-size:1.08rem}.hq-point span{font-size:.67rem;color:var(--ink-soft)}
      .hq-titleline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.hq-titleline .lbl{margin:0}.hq-count{font-size:.69rem;color:var(--gold-lt);background:rgba(232,194,103,.12);border-radius:99px;padding:4px 8px}
      .hq-task{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:12px;margin-bottom:9px}.hq-tasktop{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.hq-task h3{font-size:.9rem;color:var(--ink);line-height:1.45}.hq-state{font-size:.68rem;color:#9dc8ff;white-space:nowrap}.hq-state.approval{color:#ffd27a}.hq-state.failed{color:#ffaaa4}.hq-meta{font-size:.7rem;color:var(--ink-soft);margin-top:4px}.hq-flow{display:flex;gap:3px;margin-top:9px}.hq-step{height:4px;flex:1;border-radius:9px;background:rgba(255,255,255,.12)}.hq-step.on{background:linear-gradient(90deg,var(--gold-dk),var(--gold-lt))}
      .hq-minirow{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.hq-mini{border:1px solid var(--purple);border-radius:9px;padding:7px 9px;background:#2c1f4d;color:var(--ink);font-size:.72rem}.hq-mini.primary{border-color:var(--gold);color:#3a2400;background:linear-gradient(180deg,var(--gold-lt),var(--gold-dk));font-weight:700}
      .hq-channels{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.hq-check{display:flex;align-items:center;gap:7px;padding:9px;border:1px solid rgba(169,139,216,.25);border-radius:10px;background:rgba(20,13,38,.45);font-size:.76rem;color:var(--ink-soft)}.hq-check input{width:17px;height:17px;accent-color:var(--gold-dk)}
      .hq-note{font-size:.73rem;color:var(--ink-soft);margin-top:8px}.hq-error{font-size:.74rem;color:#ffb3b3;margin-top:8px;white-space:pre-wrap}.hq-working{font-size:.78rem;color:var(--gold-lt);padding:9px 0;text-align:center}
      .hq-output{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:9px}.hq-output summary{color:var(--gold-lt);font-size:.78rem;cursor:pointer}.hq-output pre{white-space:pre-wrap;font-family:inherit;font-size:.78rem;color:var(--ink);margin-top:7px;max-height:280px;overflow:auto}.hq-output .copy{margin-top:7px}
      .hq-quality{margin-top:9px;border-radius:10px;padding:9px;background:rgba(20,13,38,.45);font-size:.72rem;color:var(--ink-soft)}.hq-quality b{color:var(--gold-lt)}
      .hq-empty{text-align:center;color:var(--ink-soft);font-size:.78rem;padding:18px 8px}.hq-danger{color:#ff9e98!important}
      .hq-cloud{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding:9px 10px;border-radius:11px;background:rgba(20,13,38,.5);border:1px solid rgba(145,215,180,.24);font-size:.7rem;color:#91d7b4}.hq-cloud button{border:1px solid rgba(169,139,216,.45);border-radius:8px;background:#2c1f4d;color:var(--ink);padding:5px 8px;font-size:.66rem}.hq-syncbox{display:none;margin-top:8px}.hq-syncbox.on{display:flex;gap:6px}.hq-syncbox input{min-width:0;flex:1;margin:0;padding:8px;font-size:.72rem}.hq-syncbox button{margin:0;width:auto;padding:8px 10px}
      @media(max-width:360px){.hq-head{display:block}.hq-live{display:inline-block;margin-top:7px}.hq-points{grid-template-columns:1fr}.hq-channels{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function pageHtml() {
    return '<div class="hq-hero">' +
      '<div class="hq-head"><div><h2>🏢 三寶爸 AI 營運總部</h2><p>20 位 AI 員工・多產品獨立運作</p></div><span class="hq-live">● V2 AI 審稿產線</span></div>' +
      '<div class="hq-product" id="hqProduct"></div>' +
      '<div class="hq-cloud"><span id="hqCloudState">☁️ 雲端同步連線中</span><button id="hqSyncTools">同步工具</button></div>' +
      '<div class="hq-syncbox" id="hqSyncBox"><input id="hqWorkspaceInput" placeholder="貼上另一台裝置的同步碼"><button class="btn2" id="hqUseWorkspace">切換</button></div>' +
      '<div class="hq-note">⏰ 自動營運：每天 09:00 情報・14:00 內容・21:00 覆盤</div>' +
      '<div class="hq-points"><div class="hq-point"><b id="hqMorning">0</b><span>上午商機</span></div><div class="hq-point"><b id="hqAfternoon">0</b><span>下午產出</span></div><div class="hq-point"><b id="hqEvening">0</b><span>晚上覆盤</span></div></div>' +
    '</div>' +
    '<div class="panel"><div class="hq-titleline"><label class="lbl">👑 等待老闆批准</label><span class="hq-count" id="hqApprovalCount">0 件</span></div><div id="hqApprovals"></div></div>' +
    '<div class="panel"><label class="lbl">➕ 交辦新任務</label>' +
      '<textarea id="hqGoal" placeholder="例：做一組能提高天衡瀏覽率的 Threads、FB 與短影音內容"></textarea>' +
      '<div class="hq-channels">' + CHANNELS.map(function (c, i) { return '<label class="hq-check"><input type="checkbox" data-hq-channel="' + c.id + '"' + (i < 3 ? ' checked' : '') + '> ' + c.label + '</label>'; }).join("") + '</div>' +
      '<div class="hq-note">AI 會依目前主打產品建立快照，先做策略，再分平台產出，最後送你批准。</div>' +
      '<button class="btn" id="hqCreate">建立任務並開始產線 ▶</button><div id="hqCreateMsg"></div>' +
    '</div>' +
    '<div class="panel"><div class="hq-titleline"><label class="lbl">📋 任務產線</label><span class="hq-count" id="hqTaskCount">0 件</span></div><div id="hqTasks"></div></div>';
  }

  function injectPage() {
    if (document.getElementById("p_hq")) return;
    var tab = document.createElement("button");
    tab.dataset.p = "hq"; tab.textContent = "🏢 營運總部";
    document.getElementById("tabs").insertBefore(tab, document.getElementById("tabs").firstChild);

    var page = document.createElement("div");
    page.className = "page"; page.id = "p_hq"; page.innerHTML = pageHtml();
    document.querySelector(".wrap").appendChild(page);

    var nav = document.createElement("button");
    nav.dataset.p = "hq"; nav.innerHTML = '<span class="ic">🏢</span>總部';
    document.getElementById("navbar").insertBefore(nav, document.getElementById("navbar").firstChild);
  }

  function progressCount(state) {
    return { queued: 1, strategy: 2, producing: 3, reviewing: 4, revising: 5, approval: 6, returned: 5, scheduled: 7, done: 7, failed: 3 }[state] || 1;
  }
  function outputHtml(t) {
    if (!t.outputs) return "";
    return Object.keys(t.outputs).map(function (ch) {
      var item = CHANNELS.find(function (x) { return x.id === ch; });
      var special = { brief: "上午市場情報", review: "晚上營運覆盤" };
      return '<details class="hq-output"><summary>' + E(item ? item.label : (special[ch] || ch)) + '</summary><pre>' + E(t.outputs[ch]) + '</pre><button class="copy" data-hq-copy="' + E(t.id) + '" data-hq-copych="' + E(ch) + '">📋 複製</button></details>';
    }).join("");
  }
  function qualityHtml(t) {
    if (!t.quality) return "";
    var q = t.quality;
    return '<div class="hq-quality"><b>品質主管：</b>' + E(q.summary) + (q.flags && q.flags.length ? '<br>需注意：' + E(q.flags.join("、")) : '') + '</div>';
  }
  function buttonsHtml(t) {
    if (t.state === "queued" || t.state === "returned" || t.state === "failed") {
      return '<div class="hq-minirow"><button class="hq-mini primary" data-hq-run="' + E(t.id) + '">啟動產線</button><button class="hq-mini hq-danger" data-hq-del="' + E(t.id) + '">刪除</button></div>';
    }
    if (t.state === "approval") {
      return '<div class="hq-minirow"><button class="hq-mini" data-hq-return="' + E(t.id) + '">退回修改</button><button class="hq-mini primary" data-hq-approve="' + E(t.id) + '">批准排程</button></div>';
    }
    if (t.state === "scheduled") {
      return '<div class="hq-minirow"><button class="hq-mini" data-hq-done="' + E(t.id) + '">標記已發布</button></div>';
    }
    return "";
  }
  function taskHtml(t) {
    var n = progressCount(t.state);
    return '<article class="hq-task"><div class="hq-tasktop"><div><h3>' + E(t.goal) + '</h3><div class="hq-meta">📦 ' + E(t.product ? t.product.name : "未設定產品") + '　·　' + E(nowText(t.updatedAt || t.createdAt)) + '</div></div><span class="hq-state ' + E(t.state) + '">' + E(stateLabel(t.state)) + '</span></div>' +
      '<div class="hq-meta">👥 ' + E((t.employees || ["市場策略員", "內容創作員", "品質主管"]).join("・")) + '</div>' +
      '<div class="hq-flow">' + [1,2,3,4,5,6,7].map(function (i) { return '<i class="hq-step' + (i <= n ? ' on' : '') + '"></i>'; }).join("") + '</div>' +
      (t.error ? '<div class="hq-error">' + E(t.error) + '</div>' : '') + qualityHtml(t) + outputHtml(t) + buttonsHtml(t) + '</article>';
  }

  function render() {
    var rows = read();
    var p = currentProduct();
    var product = document.getElementById("hqProduct");
    if (product) product.innerHTML = p ? '📦 目前主打：<b>' + E(p.p_name || "未命名") + '</b><span>' + E(p.p_feat || "") + '</span>' : '<span class="hq-danger">⚠️ 尚未設定產品，請先到「我的產品」新增。</span>';

    var today = dayKey();
    var todayRows = rows.filter(function (x) { return dayKey(x.createdAt) === today; });
    var morning = todayRows.filter(function (x) { return progressCount(x.state) >= 2; }).length;
    var afternoon = todayRows.filter(function (x) { return x.outputs && Object.keys(x.outputs).length; }).length;
    var evening = todayRows.filter(function (x) { return x.state === "done"; }).length;
    var m = document.getElementById("hqMorning"), a = document.getElementById("hqAfternoon"), e = document.getElementById("hqEvening");
    if (m) m.textContent = morning; if (a) a.textContent = afternoon; if (e) e.textContent = evening;

    var approvals = rows.filter(function (x) { return x.state === "approval"; });
    var ac = document.getElementById("hqApprovalCount"), ah = document.getElementById("hqApprovals");
    if (ac) ac.textContent = approvals.length + " 件";
    if (ah) ah.innerHTML = approvals.length ? approvals.map(taskHtml).join("") : '<div class="hq-empty">目前沒有等待批准的內容。</div>';
    var tc = document.getElementById("hqTaskCount"), th = document.getElementById("hqTasks");
    if (tc) tc.textContent = rows.length + " 件";
    if (th) th.innerHTML = rows.length ? rows.map(taskHtml).join("") : '<div class="hq-empty">建立第一個任務後，AI 員工的交接進度會顯示在這裡。</div>';
  }

  function localQuality(task) {
    var all = Object.keys(task.outputs || {}).map(function (k) { return task.outputs[k]; }).join("\n");
    var flags = [];
    var cliches = ["相信自己", "勇敢前進", "保持正向", "充滿挑戰", "無限可能"];
    if (all.length < 180) flags.push("內容可能太短");
    if (!/[0-9０-９]|今天|最近|這週|第一步|先/.test(all)) flags.push("缺少具體時間或下一步");
    cliches.forEach(function (x) { if (all.indexOf(x) >= 0) flags.push("出現空泛句：" + x); });
    var otherBrands = ["筠玲易數", "反詐實驗室", "電子收納櫃", "天衡・九維命理"].filter(function (x) { return !task.product || x !== task.product.name; });
    otherBrands.forEach(function (x) { if (all.indexOf(x) >= 0) flags.push("疑似混入其他品牌：" + x); });
    return { pass: flags.length === 0, flags: flags, summary: flags.length ? "已完成初檢，批准前請查看標記。" : "通過具體性、罐頭句與品牌混用初檢。" };
  }

  function reportsFromOutputs(outputs) {
    return Object.keys(outputs || {}).map(function (ch) {
      var item = CHANNELS.find(function (x) { return x.id === ch; });
      return { agent: item ? item.label + "內容員" : ch + "內容員", output: outputs[ch] };
    });
  }

  async function aiReview(task, outputs) {
    try {
      var review = await callAPI("/review", {
        task: task.goal,
        profile: typeof getProfile === "function" ? getProfile() : null,
        reports: reportsFromOutputs(outputs),
        hqTaskId: task.id,
        productSnapshot: task.product
      });
      var flags = [];
      if (review.issues) flags.push(String(review.issues));
      return {
        pass: !!review.pass,
        flags: flags,
        fix: String(review.fix || ""),
        summary: review.pass ? "AI 品質主管審核通過，可送老闆批准。" : "AI 品質主管已退回，內容員正在依意見修改。"
      };
    } catch (_) {
      var fallback = localQuality(Object.assign({}, task, { outputs: outputs }));
      fallback.summary = "AI 審核暫時無回應，已改用本機品質規則完成檢查。";
      return fallback;
    }
  }

  async function runPipeline(id) {
    if (currentRunId) return;
    var t = findTask(id); if (!t) return;
    if (!t.product) { updateTask(id, { state: "failed", error: "尚未設定產品，請先到「我的產品」新增後再啟動。" }); render(); return; }
    currentRunId = id;
    try {
      updateTask(id, { state: "strategy", error: "" }); render();
      var plan = await callAPI("/content", {
        task: t.goal,
        profile: typeof getProfile === "function" ? getProfile() : null,
        today: dayKey(),
        hqTaskId: id,
        productSnapshot: t.product
      });
      var strategy = plan.content || plan.output || JSON.stringify(plan);
      updateTask(id, { state: "producing", strategy: strategy }); render();

      var outputs = {};
      for (var i = 0; i < t.channels.length; i++) {
        var ch = t.channels[i];
        var result = await callAPI("/execute", {
          task: t.goal + "\n\n【內容策略】\n" + strategy + "\n\n【品質要求】具體、台灣口語、避免罐頭、提供可執行下一步。",
          profile: typeof getProfile === "function" ? getProfile() : null,
          reports: [], channel: ch, hqTaskId: id, productSnapshot: t.product
        });
        outputs[ch] = result.output || result.content || JSON.stringify(result);
        updateTask(id, { outputs: outputs }); render();
      }
      updateTask(id, { state: "reviewing", outputs: outputs }); render();
      var latest = findTask(id);
      var quality = await aiReview(latest, outputs);

      if (!quality.pass) {
        updateTask(id, { state: "revising", quality: quality }); render();
        var revised = {};
        for (var j = 0; j < t.channels.length; j++) {
          var reviseChannel = t.channels[j];
          var oldOutput = outputs[reviseChannel] || "";
          var revisedResult = await callAPI("/execute", {
            task: t.goal + "\n\n【原稿】\n" + oldOutput + "\n\n【品質主管問題】\n" + (quality.flags || []).join("\n") + "\n\n【指定修法】\n" + (quality.fix || "改得更具體、更像真人，保留正確資訊。") + "\n\n請直接交付修改後成品，不要解釋修改過程。",
            profile: typeof getProfile === "function" ? getProfile() : null,
            reports: [], channel: reviseChannel, hqTaskId: id, productSnapshot: t.product
          });
          revised[reviseChannel] = revisedResult.output || revisedResult.content || JSON.stringify(revisedResult);
          updateTask(id, { outputs: revised }); render();
        }
        outputs = revised;
        updateTask(id, { state: "reviewing", outputs: outputs }); render();
        quality = await aiReview(findTask(id), outputs);
        if (!quality.pass) quality.summary = "已自動修改一次，仍有注意事項，交由老闆最後判斷。";
      }

      updateTask(id, { state: "approval", outputs: outputs, quality: quality });
    } catch (err) {
      updateTask(id, { state: "failed", error: String(err && err.message ? err.message : err) });
    } finally {
      currentRunId = null; render();
    }
  }

  function createTask() {
    var goal = String(document.getElementById("hqGoal").value || "").trim();
    var msg = document.getElementById("hqCreateMsg");
    if (!goal) { msg.innerHTML = '<div class="hq-error">請先寫下這次要完成的目標。</div>'; return; }
    var product = productSnapshot();
    if (!product) { msg.innerHTML = '<div class="hq-error">請先到「我的產品」新增並選定目前主打產品。</div>'; return; }
    var channels = Array.from(document.querySelectorAll("[data-hq-channel]:checked")).map(function (x) { return x.dataset.hqChannel; });
    if (!channels.length) { msg.innerHTML = '<div class="hq-error">至少選擇一種產出形式。</div>'; return; }
    var employees = ["市場策略員", "內容創作員", "品質主管"];
    if (channels.indexOf("video") >= 0) employees.splice(2, 0, "短影音編導");
    var t = { id: uid(), goal: goal, product: product, channels: channels, employees: employees, state: "queued", createdAt: Date.now(), updatedAt: Date.now(), outputs: {} };
    var rows = read(); rows.unshift(t); write(rows);
    remoteUpsert(t); syncConfig();
    document.getElementById("hqGoal").value = "";
    msg.innerHTML = '<div class="hq-working">✅ 任務已建立，AI 團隊開始接力。</div>';
    render(); runPipeline(t.id);
  }

  function copyOutput(id, ch, btn) {
    var t = findTask(id), text = t && t.outputs ? t.outputs[ch] : "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      var old = btn.textContent; btn.textContent = "✅ 已複製";
      setTimeout(function () { btn.textContent = old; }, 1400);
    }).catch(function () { btn.textContent = "請長按內容複製"; });
  }

  function bind() {
    document.getElementById("hqCreate").addEventListener("click", createTask);
    document.getElementById("hqSyncTools").addEventListener("click", function () {
      document.getElementById("hqSyncBox").classList.toggle("on");
      var input = document.getElementById("hqWorkspaceInput");
      input.value = workspaceId(); input.select();
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(function () {});
    });
    document.getElementById("hqUseWorkspace").addEventListener("click", function () {
      var id = String(document.getElementById("hqWorkspaceInput").value || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
      if (id.length < 24) { cloudState("⚠️ 同步碼格式不正確", true); return; }
      try { localStorage.setItem(WORKSPACE_KEY, id); } catch (_) {}
      cloudState("☁️ 正在切換雲端總部");
      remoteHydrate(true).then(syncConfig);
    });
    document.getElementById("p_hq").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.hqRun) runPipeline(b.dataset.hqRun);
      if (b.dataset.hqApprove) { updateTask(b.dataset.hqApprove, { state: "scheduled", approvedAt: Date.now() }); render(); }
      if (b.dataset.hqReturn) { updateTask(b.dataset.hqReturn, { state: "returned", returnNote: "請加強具體案例與真人口吻。" }); render(); }
      if (b.dataset.hqDone) { updateTask(b.dataset.hqDone, { state: "done", publishedAt: Date.now() }); render(); }
      if (b.dataset.hqDel) {
        var rows = read().filter(function (x) { return x.id !== b.dataset.hqDel; }); write(rows); remoteDelete(b.dataset.hqDel); render();
      }
      if (b.dataset.hqCopy) copyOutput(b.dataset.hqCopy, b.dataset.hqCopych, b);
    });
  }

  function hookSwitch() {
    var old = window.switchTo;
    window.switchTo = function (p) {
      var result = old ? old.apply(this, arguments) : null;
      if (p === "hq") { render(); remoteHydrate(false); syncConfig(); }
      return result;
    };
  }

  function init() {
    addStyles(); injectPage(); bind(); hookSwitch(); render();
    remoteHydrate(false).then(syncConfig);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
