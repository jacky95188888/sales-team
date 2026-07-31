/* ============================================================
   美女顧問團 · 效率三件組 patch  v1
   放在 index.html 最後，minutes-patch.js 的下一行：
   <script src="boost-patch.js"></script>
   ------------------------------------------------------------
   📋 社團發文追蹤 — 100 個社團打勾，隔天自動歸零
   💎 金句庫       — 顧問講的好句子一鍵收藏，之後產文參考你的調性
   📊 成效回灌     — 真實數據自動餵給顧問，建議越開越準
   ============================================================ */
(function () {
  "use strict";

  var GK = "advisor_groups";      // 社團清單
  var GLOG = "advisor_grouplog";  // 今日打勾狀態
  var GTXT = "advisor_grouptext"; // 今天要發的文
  var QK = "advisor_quotes";      // 金句庫
  var SK = "advisor_stats_log";   // 成效紀錄（沿用主程式 key）
  var OPT = "advisor_boost_opt";  // 開關

  function E(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var opt = rd(OPT, { useQuotes: true, useStats: true });

  /* ================= 預設社團清單 ================= */
  var SEED = [
    ["基隆美食吃透透", "基隆在地"], ["基隆好吃美食報你知", "基隆在地"], ["基隆美食聊聊", "基隆在地"],
    ["基隆美食趴趴GO", "基隆在地"], ["基隆美食地圖", "基隆在地"], ["基隆(三在)美食王", "基隆在地"],
    ["基隆美食應援團", "基隆在地"], ["大基隆❤️小確幸", "基隆在地"], ["基隆人", "基隆在地"],
    ["基隆人大小事", "基隆在地"], ["基隆人所有事", "基隆在地"], ["基隆人日常", "基隆在地"],
    ["基隆人無論任何事", "基隆在地"], ["基隆人社團", "基隆在地"], ["在地基隆人", "基隆在地"],
    ["基隆幫", "基隆在地"], ["基隆撿便宜", "基隆在地"],
    ["好想吃大台北美食", "全台美食"], ["就是愛美食-台北北北基桃", "全台美食"],
    ["北部美食吃透透", "全台美食"], ["大台北美食旅遊筆記", "全台美食"]
  ];
  function getGroups() {
    var g = rd(GK, null);
    if (!g) { g = SEED.map(function (x) { return { n: x[0], c: x[1] }; }); wr(GK, g); }
    return g;
  }
  function getLog() {
    var l = rd(GLOG, null);
    if (!l || l.date !== today()) { l = { date: today(), done: {} }; wr(GLOG, l); }
    return l;
  }

  /* ================= 建立新分頁 ================= */
  function addTab(id, label, html) {
    if (document.getElementById("p_" + id)) return;
    var tabs = document.getElementById("tabs");
    if (tabs) {
      var b = document.createElement("button");
      b.dataset.p = id; b.textContent = label; tabs.appendChild(b);
    }
    var pg = document.createElement("div");
    pg.className = "page"; pg.id = "p_" + id; pg.innerHTML = html;
    var wrap = document.querySelector(".wrap");
    if (wrap) wrap.appendChild(pg);
  }

  addTab("groups", "📋 發文追蹤",
    '<div class="panel">' +
      '<label class="lbl">📝 今天要發的文（貼在這裡，發一家複製一次）</label>' +
      '<textarea id="gText" style="min-height:110px" placeholder="把執行官產出的貼文貼進來"></textarea>' +
      '<button class="btn btn2" id="gCopy" style="margin-top:8px">📋 複製貼文</button>' +
      '<div class="hint" id="gTip"></div>' +
    '</div>' +
    '<div class="panel">' +
      '<div id="gProg"></div>' +
      '<div class="chrow" id="gFilter"></div>' +
      '<div id="gList" class="small"></div>' +
      '<div style="display:flex;gap:6px;margin-top:10px">' +
        '<input id="gNew" placeholder="新增社團名稱" style="flex:1">' +
        '<button class="copy" id="gAdd" style="margin-top:0;padding:10px 14px">＋</button>' +
      '</div>' +
      '<button class="btn btn2" id="gReset" style="margin-top:10px">↺ 重置今天的勾選</button>' +
    '</div>');

  addTab("quotes", "💎 金句庫",
    '<div class="panel">' +
      '<label class="lbl">💎 收藏的句子（顧問產文時會參考這些調性）</label>' +
      '<input id="qSearch" placeholder="🔍 搜尋" style="margin-bottom:8px">' +
      '<label class="small" style="display:block;margin-bottom:8px"><input type="checkbox" id="qUse" style="width:auto;margin-right:5px">讓顧問參考金句庫的語氣</label>' +
      '<div id="qList" class="small"></div>' +
      '<button class="btn btn2" id="qExport" style="margin-top:10px">📥 匯出 .txt</button>' +
      '<div class="hint">在顧問發言或產出的內容下方，點「💎 收藏」就會存進來。</div>' +
    '</div>');

  /* ================= 社團追蹤 ================= */
  var gFilter = "全部";
  function renderGroups() {
    var list = document.getElementById("gList"); if (!list) return;
    var gs = getGroups(), log = getLog();
    var cats = ["全部"]; gs.forEach(function (g) { if (cats.indexOf(g.c) < 0) cats.push(g.c); });

    var f = document.getElementById("gFilter");
    f.innerHTML = cats.map(function (c) {
      return '<button data-c="' + E(c) + '"' + (c === gFilter ? ' class="on"' : '') + '>' + E(c) + '</button>';
    }).join("");
    f.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { gFilter = b.dataset.c; renderGroups(); });
    });

    var done = 0; gs.forEach(function (g) { if (log.done[g.n]) done++; });
    var pct = gs.length ? Math.round(done / gs.length * 100) : 0;
    document.getElementById("gProg").innerHTML =
      '<div class="lbl">今日進度　' + done + ' / ' + gs.length + '　（' + pct + '%）</div>' +
      '<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin-bottom:4px">' +
      '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#b8923a,#f5dea0)"></div></div>' +
      '<div class="hint">建議早中晚三時段，每段 5 家，中間隔 30 分鐘以上。每次記得改一兩句再發。</div>';

    var show = gs.map(function (g, i) { return { g: g, i: i }; })
      .filter(function (x) { return gFilter === "全部" || x.g.c === gFilter; });

    list.innerHTML = show.map(function (x) {
      var on = !!log.done[x.g.n];
      return '<div data-i="' + x.i + '" class="grow" style="display:flex;align-items:center;gap:9px;padding:10px;margin-bottom:6px;border-radius:10px;background:' +
        (on ? 'rgba(212,175,55,.18)' : 'rgba(255,255,255,.05)') + ';border:1px solid ' +
        (on ? 'rgba(212,175,55,.5)' : 'rgba(255,255,255,.12)') + '">' +
        '<span style="font-size:1.1rem">' + (on ? '✅' : '⬜️') + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;' + (on ? 'opacity:.6;text-decoration:line-through' : 'color:#f0d98a') + '">' +
        E(x.g.n) + '</div><div style="font-size:.7rem;opacity:.6">' + E(x.g.c) + '</div></div>' +
        '<button data-del="' + x.i + '" style="background:none;border:none;color:#ff8f8f;font-size:.8rem;padding:4px 6px">刪</button>' +
        '</div>';
    }).join("") || '<div style="opacity:.7">這個分類還沒有社團。</div>';

    list.querySelectorAll(".grow").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.dataset.del != null) {
          var gs2 = getGroups(); gs2.splice(+e.target.dataset.del, 1); wr(GK, gs2); renderGroups(); return;
        }
        var g = getGroups()[+row.dataset.i], lg = getLog();
        if (lg.done[g.n]) delete lg.done[g.n]; else lg.done[g.n] = 1;
        wr(GLOG, lg); renderGroups();
      });
    });
  }

  function bindGroups() {
    var t = document.getElementById("gText");
    if (t) {
      t.value = rd(GTXT, "") || "";
      t.addEventListener("input", function () { wr(GTXT, t.value); });
    }
    var c = document.getElementById("gCopy");
    if (c) c.addEventListener("click", function () {
      navigator.clipboard.writeText(t.value).then(function () {
        c.textContent = "✅ 已複製"; setTimeout(function () { c.textContent = "📋 複製貼文"; }, 1500);
      }).catch(function () { document.getElementById("gTip").textContent = "無法自動複製，請長按上方文字選取。"; });
    });
    var a = document.getElementById("gAdd");
    if (a) a.addEventListener("click", function () {
      var inp = document.getElementById("gNew"), n = inp.value.trim(); if (!n) return;
      var gs = getGroups(); gs.push({ n: n, c: gFilter === "全部" ? "其他" : gFilter });
      wr(GK, gs); inp.value = ""; renderGroups();
    });
    var r = document.getElementById("gReset");
    if (r) r.addEventListener("click", function () {
      if (r.textContent.indexOf("確定") < 0) {
        r.textContent = "⚠️ 再按一次確定重置";
        setTimeout(function () { r.textContent = "↺ 重置今天的勾選"; }, 4000); return;
      }
      wr(GLOG, { date: today(), done: {} }); r.textContent = "↺ 重置今天的勾選"; renderGroups();
    });
  }

  /* ================= 金句庫 ================= */
  function getQuotes() { return rd(QK, []); }
  function addQuote(text, from) {
    var q = getQuotes();
    text = String(text || "").trim(); if (!text) return false;
    if (q.some(function (x) { return x.text === text; })) return "dup";
    q.unshift({ t: Date.now(), text: text.slice(0, 600), from: from || "" });
    if (q.length > 120) q.length = 120;
    return wr(QK, q);
  }
  var qkw = "";
  function renderQuotes() {
    var el = document.getElementById("qList"); if (!el) return;
    var chk = document.getElementById("qUse"); if (chk) chk.checked = !!opt.useQuotes;
    var q = getQuotes();
    if (qkw) { var k = qkw.toLowerCase(); q = q.filter(function (x) { return x.text.toLowerCase().indexOf(k) >= 0; }); }
    if (!q.length) { el.innerHTML = '<div style="opacity:.7">' + (qkw ? "沒有符合的句子。" : "還沒有收藏。在顧問發言下方點「💎 收藏」。") + "</div>"; return; }
    el.innerHTML = q.map(function (x, i) {
      var d = new Date(x.t);
      return '<div style="padding:10px;margin-bottom:6px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)">' +
        '<div style="font-size:.7rem;opacity:.6">' + (d.getMonth() + 1) + '/' + d.getDate() + (x.from ? '　' + E(x.from) : '') + '</div>' +
        '<div style="font-size:.82rem;white-space:pre-wrap;margin:4px 0">' + E(x.text) + '</div>' +
        '<div style="display:flex;gap:6px">' +
        '<button class="copy" data-qc="' + i + '" style="margin-top:0">📋 複製</button>' +
        '<button class="copy" data-qd="' + i + '" style="margin-top:0">🗑 刪除</button></div></div>';
    }).join("");
    el.querySelectorAll("[data-qc]").forEach(function (b) {
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(q[+b.dataset.qc].text).then(function () {
          b.textContent = "✅"; setTimeout(function () { b.textContent = "📋 複製"; }, 1200);
        }).catch(function () {});
      });
    });
    el.querySelectorAll("[data-qd]").forEach(function (b) {
      b.addEventListener("click", function () {
        var all = getQuotes(), target = q[+b.dataset.qd];
        wr(QK, all.filter(function (x) { return x.t !== target.t; })); renderQuotes();
      });
    });
  }
  function bindQuotes() {
    var s = document.getElementById("qSearch");
    if (s) s.addEventListener("input", function () { qkw = s.value.trim(); renderQuotes(); });
    var c = document.getElementById("qUse");
    if (c) c.addEventListener("change", function () { opt.useQuotes = c.checked; wr(OPT, opt); });
    var e = document.getElementById("qExport");
    if (e) e.addEventListener("click", function () {
      var txt = getQuotes().map(function (x) { return "─────\n" + x.text; }).join("\n\n");
      try {
        var b = new Blob(["\ufeff" + txt], { type: "text/plain;charset=utf-8" });
        var u = URL.createObjectURL(b), a = document.createElement("a");
        a.href = u; a.download = "金句庫_" + today() + ".txt";
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 3000);
      } catch (err) { navigator.clipboard.writeText(txt).catch(function () {}); }
    });
  }

  /* 自動在每個發言泡泡下加「💎 收藏」 */
  function stampQuoteBtns() {
    document.querySelectorAll(".bubble:not([data-q]),.out:not([data-q])").forEach(function (box) {
      box.setAttribute("data-q", "1");
      var b = document.createElement("button");
      b.className = "copy"; b.textContent = "💎 收藏";
      b.style.marginRight = "6px";
      b.addEventListener("click", function () {
        var who = "";
        var card = box.closest(".advisor");
        if (card) { var w = card.querySelector(".who"); if (w) who = w.textContent.trim(); }
        var r = addQuote(box.textContent, who);
        b.textContent = r === "dup" ? "已收藏過" : (r ? "✅ 已收藏" : "❌ 存不進去");
        setTimeout(function () { b.textContent = "💎 收藏"; }, 1600);
        renderQuotes();
      });
      box.insertAdjacentElement("afterend", b);
    });
  }
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(stampQuoteBtns, 200); });
  var wrapEl = document.querySelector(".wrap");
  if (wrapEl) mo.observe(wrapEl, { childList: true, subtree: true });

  /* ================= 成效回灌 ================= */
  function getStats() { return rd(SK, []); }

  // 讀成效時，自動記下是哪場會議的方向
  var origPush = window.pushStats;
  window.pushStats = function (rec) {
    try {
      var mins = rd("advisor_minutes", []);
      if (mins.length) rec.fromTask = mins[0].task || "";
    } catch (e) {}
    if (typeof origPush === "function") return origPush(rec);
  };

  function statsDigest() {
    var a = getStats().slice(0, 12);
    if (!a.length) return "";
    var n = 0, L = 0, V = 0, best = null;
    a.forEach(function (r) {
      if (r.likes != null) { L += +r.likes || 0; n++; }
      V += +r.views || 0;
      if (!best || (+r.views || 0) > (+best.views || 0)) best = r;
    });
    var s = "近 " + a.length + " 篇實際成效：平均讚 " + (n ? Math.round(L / n) : "—") +
      "，累計瀏覽 " + V;
    if (best && best.fromTask) s += "。表現最好的方向是「" + best.fromTask + "」，瀏覽 " + (best.views || "—");
    return s;
  }

  function renderStatsBar() {
    var host = document.getElementById("curProdBar"); if (!host) return;
    var old = document.getElementById("statsBar"); if (old) old.remove();
    var d = statsDigest(); if (!d) return;
    var el = document.createElement("div");
    el.id = "statsBar"; el.className = "curprod";
    el.innerHTML = '<span>📊</span><span>' + E(d) + '</span>';
    host.insertAdjacentElement("afterend", el);
  }

  /* ================= 把真實資料餵給顧問 ================= */
  var origCall = window.callAPI;
  if (typeof origCall === "function") {
    window.callAPI = function (path, payload) {
      try {
        payload = payload || {};
        if (opt.useStats) {
          var d = statsDigest();
          if (d) {
            payload.performance = d;
            payload.profile = payload.profile || {};
            payload.profile.performance = d;
          }
        }
        if (opt.useQuotes) {
          var q = getQuotes().slice(0, 8).map(function (x) { return x.text.slice(0, 200); });
          if (q.length) {
            payload.styleRefs = q;
            payload.profile = payload.profile || {};
            payload.profile.styleRefs = q;
          }
        }
      } catch (e) {}
      return origCall.call(this, path, payload);
    };
  }

  /* ================= 掛進分頁切換 ================= */
  var origSwitch = window.switchTo;
  window.switchTo = function (p) {
    var r = origSwitch ? origSwitch.apply(this, arguments) : null;
    if (p === "groups") renderGroups();
    if (p === "quotes") renderQuotes();
    if (p === "meet") renderStatsBar();
    return r;
  };

  bindGroups(); bindQuotes();
  renderGroups(); renderQuotes(); renderStatsBar(); stampQuoteBtns();
})();
