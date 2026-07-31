/* ============================================================
   美女顧問團 · 會議記錄自動儲存 + 效率強化 patch  v2
   用法：放在 index.html 最後，pipeline-patch.js 的下一行
   <script src="minutes-patch.js"></script>
   ------------------------------------------------------------
   原本的問題：
   會議記錄只有在「按下 💾 存交接紀錄」而且 /summary 這支 API
   成功回來時才會寫入。API 一失敗、或忘了按、或中途關掉 App，
   整場會議就消失了。

   這個 patch 改成：
   顧問意見出來 → 立刻存
   深度報告出來 → 更新同一筆
   把關官審完   → 更新同一筆
   CEO 摘要成功 → 補進同一筆
   API 掛掉也不會丟資料，一場會議只佔一筆。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "advisor_minutes";   // 沿用原本 key，舊記錄不會不見
  var MAX_REC = 30;              // 保留最近 30 場
  var MAX_FIELD = 12000;         // 單一欄位字數上限
  var curId = null;              // 本場會議 id

  /* ---------- 安全取用主程式的全域變數 ---------- */
  function gTask()      { try { return lastTask || ""; }     catch (e) { return ""; } }
  function gOpinions()  { try { return lastOpinions || []; } catch (e) { return []; } }
  function gReports()   { try { return lastReports || []; }  catch (e) { return []; } }
  function setReports(a){ try { lastReports = a; }           catch (e) {} }
  function NM(r) { try { return NAMES[r]  || r;  } catch (e) { return r;  } }
  function TT(r) { try { return TITLES[r] || ""; } catch (e) { return ""; } }
  function E(t)  { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function cut(t){ return String(t == null ? "" : t).slice(0, MAX_FIELD); }

  /* ---------- 讀寫本機 ---------- */
  function readAll() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function writeAll(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a)); return true; }
    catch (e) {
      try {                              // 空間不足：砍掉一半最舊的再試
        var half = a.slice(0, Math.max(3, Math.floor(a.length / 2)));
        localStorage.setItem(KEY, JSON.stringify(half));
        return true;
      } catch (e2) { return false; }
    }
  }

  function stamp(t) {
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ---------- 開會頁的存檔狀態燈 ---------- */
  function flag(text, ok) {
    var host = document.getElementById("meetStatus");
    if (!host) return;
    var el = document.getElementById("saveFlag");
    if (!el) {
      el = document.createElement("div");
      el.id = "saveFlag";
      el.style.cssText = "font-size:.74rem;text-align:right;padding:2px 2px 6px";
      host.parentNode.insertBefore(el, host);
    }
    el.style.color = ok ? "#8fd18f" : "#ffb3b3";
    el.textContent = text;
  }

  /* ---------- 核心：寫入 / 更新本場會議 ---------- */
  function autoSave(stage, extra) {
    var task = gTask();
    if (!task) return;
    if (!curId) curId = Date.now();

    var all = readAll(), idx = -1;
    for (var i = 0; i < all.length; i++) { if (all[i].id === curId) { idx = i; break; } }

    var rec = idx >= 0 ? all[idx] : { id: curId, t: Date.now() };
    rec.task    = String(task).slice(0, 300);
    rec.stage   = stage;
    rec.updated = Date.now();

    try {
      var p = (typeof currentProductObj === "function") ? currentProductObj() : null;
      if (p) rec.product = p.p_name || "";
    } catch (e) {}

    var ops  = gOpinions();
    if (ops.length)  rec.opinions = ops.map(function (o) { return { role: o.role, output: cut(o.output) }; });
    var reps = gReports();
    if (reps.length) rec.reports  = reps.map(function (r) { return { role: r.role, output: cut(r.output) }; });
    if (extra && extra.review)  rec.review  = cut(extra.review);
    if (extra && extra.summary) rec.summary = cut(extra.summary);

    if (idx >= 0) all[idx] = rec; else all.unshift(rec);
    if (all.length > MAX_REC) all.length = MAX_REC;

    var ok = writeAll(all);
    flag(ok ? "💾 已自動存檔 " + stamp(rec.updated)
            : "⚠️ 存檔失敗：本機空間已滿，或目前是無痕模式", ok);
    render();
  }

  /* ---------- 組出可讀全文（相容舊格式） ---------- */
  function bodyOf(m) {
    if (!m.opinions && !m.reports && !m.summary && m.body) return m.body;
    var s = [];
    if (m.product) s.push("【產品】" + m.product);
    if (m.summary) s.push("【CEO 交接摘要】\n" + m.summary);
    if (m.opinions && m.opinions.length) {
      s.push("【顧問意見】\n" + m.opinions.map(function (o) {
        return "◆ " + NM(o.role) + "（" + TT(o.role) + "）\n" + o.output;
      }).join("\n\n"));
    }
    if (m.reports && m.reports.length) {
      s.push("【深度報告】\n" + m.reports.map(function (r) {
        return "◆ " + NM(r.role) + "（" + TT(r.role) + "）\n" + r.output;
      }).join("\n\n"));
    }
    if (m.review) s.push("【把關官】\n" + m.review);
    return s.join("\n\n");
  }

  /* ---------- 會議記錄頁 UI ---------- */
  var kw = "", openSet = {}, armed = {}, clearArmed = false;

  function ensureBar() {
    var host = document.getElementById("minutesList");
    if (!host || document.getElementById("minSearch")) return;
    var bar = document.createElement("div");
    bar.innerHTML =
      '<input id="minSearch" placeholder="🔍 搜尋主題或內容" style="margin-bottom:8px">' +
      '<div style="display:flex;gap:6px;margin-bottom:6px">' +
      '<button id="minExport"  class="btn btn2" style="margin-top:0;padding:10px;font-size:.8rem">📥 匯出 .txt</button>' +
      '<button id="minCopyAll" class="btn btn2" style="margin-top:0;padding:10px;font-size:.8rem">📋 複製全部</button>' +
      '</div><div id="minFlag" class="hint" style="min-height:0"></div>';
    host.parentNode.insertBefore(bar, host);
    document.getElementById("minSearch").addEventListener("input", function () { kw = this.value.trim(); render(); });
    document.getElementById("minExport").addEventListener("click", exportTxt);
    document.getElementById("minCopyAll").addEventListener("click", function (e) { copyAll(e.currentTarget); });
  }

  function minFlag(t) { var e = document.getElementById("minFlag"); if (e) e.textContent = t || ""; }

  function allAsText() {
    return readAll().map(function (m) {
      return "════════════════════\n" + stamp(m.updated || m.t) + "　" + (m.task || "") +
        "\n════════════════════\n" + bodyOf(m);
    }).join("\n\n");
  }

  function exportTxt() {
    var txt = allAsText();
    if (!txt) { minFlag("目前沒有記錄可以匯出。"); return; }
    try {
      var blob = new Blob(["\ufeff" + txt], { type: "text/plain;charset=utf-8" });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url;
      a.download = "顧問團會議記錄_" + new Date().toISOString().slice(0, 10) + ".txt";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 3000);
      minFlag("已產生檔案，請在下載或分享選單存檔。");
    } catch (e) {
      copyAll(document.getElementById("minExport"));
    }
  }

  function copyAll(btn) {
    var txt = allAsText();
    if (!txt) { minFlag("目前沒有記錄可以複製。"); return; }
    navigator.clipboard.writeText(txt).then(function () {
      if (btn) { var o = btn.textContent; btn.textContent = "✅ 已複製"; setTimeout(function () { btn.textContent = o; }, 1600); }
    }).catch(function () { minFlag("這個瀏覽器擋了複製，請改用匯出 .txt。"); });
  }

  function btn(act, key, label) {
    return '<button data-act="' + act + '" data-key="' + key + '" class="copy" style="margin-top:0">' + label + '</button>';
  }
  function stageName(s) {
    return { opinions: "顧問意見", deep: "深度報告", review: "把關完成", done: "已結案" }[s] || s;
  }

  function render() {
    var el = document.getElementById("minutesList");
    if (!el) return;
    ensureBar();

    var all = readAll();
    if (kw) {
      var k = kw.toLowerCase();
      all = all.filter(function (m) { return ((m.task || "") + " " + bodyOf(m)).toLowerCase().indexOf(k) >= 0; });
    }
    if (!all.length) {
      el.innerHTML = '<div style="opacity:.7">' +
        (kw ? "沒有符合「" + E(kw) + "」的會議。" : "還沒有會議記錄。開會一有結果就會自動存在這裡。") + "</div>";
      return;
    }

    el.innerHTML = all.map(function (m) {
      var key  = m.id || m.t;
      var open = !!openSet[key];
      return '<div style="margin-bottom:10px;padding:11px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)">' +
        '<div style="font-size:.72rem;opacity:.7">' + stamp(m.updated || m.t) +
          (m.product ? '　📦 ' + E(m.product) : '') +
          (m.stage ? '　· ' + E(stageName(m.stage)) : '') + '</div>' +
        '<div style="font-weight:700;color:#f0d98a;margin:4px 0">' + E(m.task) + '</div>' +
        '<div style="font-size:.78rem;white-space:pre-wrap;' +
          (open ? '' : 'max-height:110px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 55%,transparent)') +
          '">' + E(bodyOf(m)) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' +
          btn('mn-open', key, open ? '收合' : '展開全文') +
          btn('mn-copy', key, '📋 複製') +
          btn('mn-exec', key, '➡️ 再產出成品') +
          btn('mn-del',  key, armed[key] ? '⚠️ 再按一次刪除' : '🗑 刪除') +
        '</div></div>';
    }).join("");

    el.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { act(b.dataset.act, b.dataset.key, b); });
    });
  }

  function act(a, key, b) {
    var all = readAll(), m = null, idx = -1;
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id || all[i].t) === String(key)) { m = all[i]; idx = i; break; }
    }
    if (!m) return;

    if (a === "mn-open") { openSet[key] = !openSet[key]; render(); }

    if (a === "mn-copy") {
      navigator.clipboard.writeText(bodyOf(m)).then(function () {
        b.textContent = "✅ 已複製";
        setTimeout(function () { b.textContent = "📋 複製"; }, 1500);
      }).catch(function () { b.textContent = "長按上方文字複製"; });
    }

    if (a === "mn-exec") {                    // 舊會議直接丟回執行官重出成品
      setReports(m.reports || []);
      if (typeof switchTo === "function") switchTo("execute");
      var t = document.getElementById("execTask");
      if (t) t.value = m.task || "";
    }

    if (a === "mn-del") {
      if (!armed[key]) {
        armed[key] = true; render();
        setTimeout(function () { armed[key] = false; render(); }, 4000);
        return;
      }
      all.splice(idx, 1); writeAll(all); armed[key] = false; render();
    }
  }

  /* ---------- 覆寫主程式函式 ---------- */
  window.renderMinutes = render;
  window.saveMinute = function (task, content) { autoSave("done", { summary: content }); };

  window.clearMinutes = function () {
    if (!clearArmed) {
      clearArmed = true;
      minFlag("⚠️ 這會刪掉全部記錄。再按一次「清空記錄」才會執行。");
      setTimeout(function () { clearArmed = false; minFlag(""); }, 4000);
      return;
    }
    clearArmed = false;
    try { localStorage.removeItem(KEY); } catch (e) {}
    openSet = {}; minFlag("已清空。"); render();
  };

  function wrap(name, stage, after) {
    var orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = async function () {
      var r = await orig.apply(this, arguments);
      try { autoSave(stage, after ? after() : null); } catch (e) {}
      return r;
    };
  }

  // 開新會議 → 換一個 id，後面各階段都更新同一筆
  var origStage1 = window.stage1;
  if (typeof origStage1 === "function") {
    window.stage1 = async function () {
      curId = Date.now();
      var r = await origStage1.apply(this, arguments);
      try { if (gOpinions().length) autoSave("opinions"); } catch (e) {}
      return r;
    };
  }

  wrap("stage2",   "deep");
  wrap("redoDeep", "deep");
  wrap("doReview", "review", function () {
    var w = document.getElementById("reviewwrap");
    return { review: w ? w.innerText.replace(/\s*\n\s*\n+/g, "\n\n").trim() : "" };
  });

  // 存交接紀錄：先保住本機，再打 API；API 掛了也不丟資料
  window.saveMeeting = async function () {
    autoSave("done");
    try {
      var data = await callAPI("/summary", {
        task: gTask(), opinions: gOpinions(), reports: gReports(),
        today: new Date().toISOString().slice(0, 10)
      });
      if (data && data.record) {
        if (typeof saveRecord   === "function") saveRecord(data.record);
        if (typeof renderHandoff === "function") renderHandoff();
        autoSave("done", { summary: data.record.summary || "" });
      }
      var ms = document.getElementById("meetStatus");
      if (ms) ms.innerHTML = '<div class="status">✅ 已存交接紀錄＋會議記錄</div>';
    } catch (e) {
      var ms2 = document.getElementById("meetStatus");
      if (ms2) ms2.innerHTML = '<div class="err">會議記錄已存在本機。CEO 摘要沒產生成功：' +
        E(e.message || e) + '\n完整內容可到「🗒 會議記錄」查看。</div>';
    }
  };

  render();
})();
