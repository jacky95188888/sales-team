/* ============================================================
 * 三寶爸・美女顧問團 — 七步產線 + 監測 + 演算法 前端補丁
 * 掛法：在 index.html 的 </script> 前一行加：
 *   <script src="pipeline-patch.js"></script>
 * 本檔完全不改動原有函式，只「附加」新功能。
 * 依賴原檔已有的全域：WORKER_URL, NAMES, TITLES, EMOJI, callAPI,
 *   getProfile, esc, cp, switchTo, photo, lastTask, lastReports 等。
 * ============================================================ */
(function(){
"use strict";

// 若原檔還沒載入完，延後執行
if(typeof callAPI!=="function"){ window.addEventListener("load", init); }
else { init(); }

function init(){
  injectStyles();
  injectTabsAndPages();
  patchMeetFlow();
  bindNewNav();
}

/* ---------- 1. 樣式（沿用金紫風）---------- */
function injectStyles(){
  var css=`
  .datapack{background:linear-gradient(160deg,rgba(30,45,60,.7),rgba(20,32,45,.7));border:1px solid #4a90c0;border-left:3px solid #6ec1ff;border-radius:12px;padding:12px 14px;font-size:.86rem;white-space:pre-wrap;margin:10px 0;color:#d8ecff;}
  .datapack .dp-h{color:#8fd0ff;font-weight:800;margin-bottom:5px;display:block;font-size:.8rem;letter-spacing:.03em;}
  .dirwrap{margin:14px 0;}
  .dircard{background:linear-gradient(160deg,#2c1f4d,#241640);border:1.5px solid var(--purple);border-radius:14px;padding:13px;margin-bottom:10px;transition:.25s;}
  .dircard.sel{border-color:var(--gold);box-shadow:0 0 16px rgba(232,194,103,.4);background:linear-gradient(160deg,#3a2a1a,#2c1f12);}
  .dircard h4{color:var(--gold-lt);font-size:1rem;margin-bottom:5px;display:flex;align-items:center;gap:7px;}
  .dircard .core{font-size:.9rem;color:var(--ink);margin-bottom:6px;font-weight:600;}
  .dircard .meta{font-size:.78rem;color:var(--ink-soft);white-space:pre-wrap;}
  .dircard .pickdir{margin-top:9px;width:100%;border:none;border-radius:10px;padding:11px;font-weight:800;background:linear-gradient(160deg,#3a2960,#241640);color:var(--gold-lt);border:1.5px solid var(--gold);}
  .dircard.sel .pickdir{background:linear-gradient(180deg,var(--gold-lt),var(--gold-dk));color:#3a2400;}
  .srclink{font-size:.72rem;color:#8fb8d8;display:block;margin-top:2px;word-break:break-all;}
  .mon-item,.mon-note{background:rgba(20,13,38,.6);border:1px solid rgba(169,139,216,.3);border-radius:11px;padding:11px;margin-bottom:9px;font-size:.84rem;}
  .mon-item b{color:var(--gold-lt);}
  .mon-tpl{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}
  .mon-tpl button{background:linear-gradient(160deg,#3a2960,#2c1f4d);border:1px solid var(--purple);border-radius:16px;padding:7px 12px;font-size:.76rem;color:var(--ink);}
  .algo-mode{display:flex;gap:6px;margin:9px 0;}
  .algo-mode button{flex:1;background:linear-gradient(160deg,#3a2960,#2c1f4d);border:1px solid var(--purple);border-radius:11px;padding:10px;font-size:.78rem;color:var(--ink);}
  .algo-mode button.on{background:linear-gradient(180deg,var(--gold-lt),var(--gold-dk));color:#3a2400;font-weight:800;}
  `;
  var s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
}

/* ---------- 2. 加分頁按鈕 + 頁面容器 ---------- */
function injectTabsAndPages(){
  // 上方 tabs 加兩顆
  var tabs=document.getElementById("tabs");
  if(tabs && !document.querySelector('#tabs [data-p="monitor"]')){
    var b1=document.createElement("button");b1.dataset.p="monitor";b1.innerHTML="🔔 監測";
    var b2=document.createElement("button");b2.dataset.p="algo";b2.innerHTML="📐 演算法";
    tabs.appendChild(b1);tabs.appendChild(b2);
  }
  // 監測頁
  if(!document.getElementById("p_monitor")){
    var mp=document.createElement("div");mp.className="page";mp.id="p_monitor";
    mp.innerHTML=`
      <div class="panel">
        <label class="lbl">🔔 監測助理</label>
        <div class="hint">定時巡視你設定的網址，有重要變化才通知。政府公告、競品、AI新聞、商品降價都可監測。</div>
        <div class="mon-tpl" id="monTpl"></div>
        <label class="lbl" style="margin-top:8px">監測名稱</label>
        <input id="mon_label" placeholder="例：基隆市政府公告 / 競品官網">
        <label class="lbl" style="margin-top:8px">要監測的網址</label>
        <input id="mon_url" placeholder="https://...">
        <label class="lbl" style="margin-top:8px">監測目的（給判斷官參考）</label>
        <input id="mon_purpose" placeholder="例：看有沒有新補助 / competitor 有沒有降價">
        <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="mon_judge" checked style="width:auto;margin-right:5px">用顧問判斷變化重不重要（寧缺勿濫）</label>
        <button class="btn" onclick="monAdd()">＋ 加入監測清單</button>
      </div>
      <div class="panel">
        <label class="lbl">📋 目前監測清單</label>
        <div id="monList" class="small"></div>
        <button class="btn btn2" onclick="monLoad()">🔄 重新整理</button>
      </div>
      <div class="panel">
        <label class="lbl">📨 監測到的變化</label>
        <div id="monNotes" class="small"></div>
        <button class="btn btn2" onclick="monNotesLoad()">🔄 撈最新通知</button>
      </div>`;
    var mNav=document.getElementById("p_minutes");
    mNav.parentNode.insertBefore(mp, mNav.nextSibling);
  }
  // 演算法頁
  if(!document.getElementById("p_algo")){
    var ap=document.createElement("div");ap.className="page";ap.id="p_algo";
    ap.innerHTML=`
      <div class="panel">
        <label class="lbl">📐 演算法分析</label>
        <div class="hint">分析這題材在各平台演算法下該怎麼發最容易被推。</div>
        <div class="algo-mode" id="algoMode">
          <button data-m="fixed" class="on">快速分析</button>
          <button data-m="live">查最新變化</button>
          <button data-m="vision">讀成效截圖</button>
        </div>
        <div id="algoTextWrap">
          <textarea id="algo_task" placeholder="例：想用故事貼文推天衡命理工具"></textarea>
          <button class="btn" id="algoRun" onclick="algoGo()">分析 ▶</button>
        </div>
        <div id="algoImgWrap" style="display:none">
          <input type="file" accept="image/*" id="algo_file" onchange="algoVision(event)">
          <div class="hint">上傳貼文成效截圖，回推演算法為什麼推/不推，並給下一篇怎麼改。</div>
        </div>
      </div>
      <div id="algoOut"></div>`;
    var monPage=document.getElementById("p_monitor");
    monPage.parentNode.insertBefore(ap, monPage.nextSibling);
  }
  // 綁演算法模式切換
  var am=document.getElementById("algoMode");
  if(am){am.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;
    am.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");
    window._algoMode=b.dataset.m;
    document.getElementById("algoTextWrap").style.display=(b.dataset.m==="vision")?"none":"block";
    document.getElementById("algoImgWrap").style.display=(b.dataset.m==="vision")?"block":"none";
  });}
  window._algoMode="fixed";
  // 載入監測範本
  renderMonTemplates();
}

function renderMonTemplates(){
  var box=document.getElementById("monTpl");if(!box)return;
  var tpls=[
    {label:"商品降價",purpose:"追蹤價格/優惠/補貨"},
    {label:"AI 科技新聞",purpose:"新模型/新功能/官方公告"},
    {label:"政府公告與法規",purpose:"補助/法規/行政命令"},
    {label:"競品/YouTube 更新",purpose:"新品/新影片/活動"},
  ];
  box.innerHTML=tpls.map(function(t,i){return '<button onclick="monTpl('+i+')">'+t.label+'</button>';}).join("");
  window._monTpls=tpls;
}
window.monTpl=function(i){var t=window._monTpls[i];if(!t)return;
  var l=document.getElementById("mon_label"),p=document.getElementById("mon_purpose");
  if(l&&!l.value)l.value=t.label;if(p&&!p.value)p.value=t.purpose;
  var u=document.getElementById("mon_url");if(u)u.focus();
};

/* ---------- 3. 掛新分頁到底部導覽的切換（沿用原 switchTo）---------- */
function bindNewNav(){
  // 原 switchTo 已能處理任意 p_xxx；監測/演算法頁載入時順帶刷新
  var origSwitch=window.switchTo;
  window.switchTo=function(p){
    origSwitch(p);
    if(p==="monitor"){ monLoad(); monNotesLoad(); }
  };
}

/* ---------- 4. 改造開會流程：顯示即時數據 + 方向選擇 + 整合方案 ---------- */
function patchMeetFlow(){
  // 開會時顯示即時數據包，是靠下方「包一層 callAPI」攔 /opinions 回傳的 dataPack 完成的（見檔尾）。
  // 這裡負責包住原 stage2：深度報告後，多顯示「方向選擇」。
  if(typeof window.stage2==="function"){
    var _stage2=window.stage2;
    window.stage2=async function(){
      var w=document.getElementById("deepwrap");
      var b=document.getElementById("deepbtn");if(b){b.disabled=true;b.textContent="深度報告產出中…（約 30~60 秒）";}
      try{
        var data=await callAPI("/deepdive",{task:window.lastTask,picks:[...window.picked],opinions:window.lastOpinions,profile:getProfile(),today:localDateKey(),timezone:"Asia/Taipei",dataPack:window._lastDataPack||""});
        window.lastReports=data.reports;
        w.insertAdjacentHTML("beforeend",'<div class="status">✦ 深度報告 ✦</div>');
        var i=0;(function nx(){
          if(i>=data.reports.length){
            renderDirections(data.directions);   // 先由老闆選方向，再整合、再把關
            return;
          }
          var t=data.reports[i];var m=document.createElement("div");m.className="advisor deep";
          m.innerHTML=photo(t.role)+'<div class="bw"><div class="who">'+NAMES[t.role]+' <small>'+TITLES[t.role]+'・深度</small></div><div class="bubble">'+esc(t.output)+'</div><button class="copy" onclick="cp(this)">📋 複製</button></div>';
          w.appendChild(m);setTimeout(function(){m.classList.add("show");},30);i++;setTimeout(nx,260);
        })();
      }catch(e){ if(typeof showErr==="function") showErr("deepwrap",e.message||e); }
    };
  }
}

/* 顯示 2-3 個方向讓老闆選（決策點②）*/
function renderDirections(directions){
  if(!Array.isArray(directions)||!directions.length){directions=[{title:"依重點報告整合",core:"將本輪深度報告整合成可執行方案",why:"服務未提供候選方向，使用安全備援流程",firstStep:"整合現有建議",risk:"請人工確認內容是否符合實際限制"}];}
  window._directions=directions;window._chosenDir=null;
  var wrap=document.createElement("div");wrap.className="dirwrap";wrap.id="dirwrap";
  wrap.innerHTML='<div class="status">✦ 請選一個方向（老闆決策）✦</div>'+
    directions.map(function(d,i){
      return '<div class="dircard" id="dir'+i+'">'+
        '<h4>🎯 '+esc(d.title||("方向"+(i+1)))+'</h4>'+
        '<div class="core">'+esc(d.core||"")+'</div>'+
        '<div class="meta">為何可行：'+esc(d.why||"")+'\n第一步：'+esc(d.firstStep||"")+'\n最大風險：'+esc(d.risk||"")+'</div>'+
        '<button class="pickdir" onclick="chooseDir('+i+')">選這個方向</button>'+
      '</div>';
    }).join("");
  document.getElementById("deepwrap").appendChild(wrap);
}
window.renderDirections=renderDirections;
window.chooseDir=function(i){
  window._chosenDir=window._directions[i];
  document.querySelectorAll(".dircard").forEach(function(c,idx){c.classList.toggle("sel",idx===i);});
  // 顯示「整合成執行方案」按鈕
  var old=document.getElementById("finalizeBtn");if(old)old.remove();
  var btn=document.createElement("button");btn.className="btn";btn.id="finalizeBtn";
  btn.textContent="📄 整合成執行方案 ▶";btn.onclick=doFinalize;
  document.getElementById("dirwrap").appendChild(btn);
  // 補充需求輸入
  if(!document.getElementById("extraNeed")){
    var ta=document.createElement("textarea");ta.id="extraNeed";ta.placeholder="（選填）這邊的實際需求／限制，整合員會一起考慮";
    ta.style.marginTop="9px";
    document.getElementById("dirwrap").insertBefore(ta,btn);
  }
};
async function doFinalize(){
  var wrap=document.getElementById("dirwrap");
  var btn=document.getElementById("finalizeBtn");if(btn){btn.disabled=true;btn.textContent="整合員產出方案中…";}
  try{
    var extra=document.getElementById("extraNeed");
    var data=await callAPI("/finalize",{
      task:window.lastTask,today:localDateKey(),timezone:"Asia/Taipei",profile:getProfile(),
      dataPack:window._lastDataPack||"",opinions:window.lastOpinions||[],reports:window.lastReports||[],
      direction:window._chosenDir,extraNeed:extra?extra.value.trim():""
    });
    var out=document.createElement("div");out.innerHTML='<div class="out">📄 執行方案\n\n'+esc(data.plan)+'</div><button class="copy" onclick="cp(this)">📋 複製方案</button>';
    wrap.appendChild(out);
    // 最終方案必須進入同一條資料流，否則把關官與執行官只會看到舊的深度報告。
    window._finalPlan=data.plan||"";
    window.lastReports=(window.lastReports||[]).filter(function(r){return r&&!r._isFinalPlan;});
    window.lastReports.push({role:"strategy",_isFinalPlan:true,output:"【老闆選定後的整合執行方案】\n"+(data.plan||"")});
    if(typeof showReviewBtn==="function") showReviewBtn();
    if(btn){btn.style.display="none";}
  }catch(e){ if(typeof showErr==="function") showErr("deepwrap",e.message||e); if(btn){btn.disabled=false;btn.textContent="📄 整合成執行方案 ▶";} }
}

/* ---------- 5. 監測分頁功能 ---------- */
window.monAdd=async function(){
  var label=val("mon_label"),url=val("mon_url"),purpose=val("mon_purpose");
  var useJudge=document.getElementById("mon_judge").checked;
  if(!url){alert("請填要監測的網址");return;}
  if(!/^https:\/\//i.test(url)){alert("監測網址只接受 https:// 開頭");return;}
  try{
    // 先讀現有清單，append 後存回
    var cur=await callAPI("/monitor-config",{action:"list"});
    var items=(cur.items||[]).slice();
    items.push({label:label,url:url,purpose:purpose,useJudge:useJudge,enabled:true});
    var r=await callAPI("/monitor-config",{action:"save",items:items});
    if(r.error){alert(r.error);return;}
    ["mon_label","mon_url","mon_purpose"].forEach(function(id){var e=document.getElementById(id);if(e)e.value="";});
    monLoad();
  }catch(e){alert(e.message||e);}
};
window.monLoad=async function(){
  var box=document.getElementById("monList");if(!box)return;box.innerHTML='<div class="hint">讀取中…</div>';
  try{
    var r=await callAPI("/monitor-config",{action:"list"});
    if(r.error){box.innerHTML='<div class="err">'+esc(r.error)+'</div>';return;}
    var items=r.items||[];
    if(!items.length){box.innerHTML='<div class="hint">還沒有監測項。上面加一個試試。</div>';return;}
    box.innerHTML=items.map(function(it,i){
      return '<div class="mon-item"><b>'+esc(it.label||it.url)+'</b>'+(it.enabled?'':'（已停用）')+
        '<div class="srclink">'+esc(it.url)+'</div>'+
        (it.purpose?'<div style="opacity:.8">目的：'+esc(it.purpose)+'</div>':'')+
        '<button class="copy" onclick="monDel('+i+')">🗑 移除</button></div>';
    }).join("");
    window._monItems=items;
  }catch(e){box.innerHTML='<div class="err">'+esc(e.message||e)+'</div>';}
};
window.monDel=async function(i){
  var items=(window._monItems||[]).slice();items.splice(i,1);
  try{ await callAPI("/monitor-config",{action:"save",items:items}); monLoad(); }
  catch(e){alert(e.message||e);}
};
window.monNotesLoad=async function(){
  var box=document.getElementById("monNotes");if(!box)return;box.innerHTML='<div class="hint">撈取中…</div>';
  try{
    var resp=await fetch(WORKER_URL.replace(/\/$/,"")+"/monitor-notes");
    var raw=await resp.text(),r;
    try{r=raw?JSON.parse(raw):{};}catch(_){throw new Error("監測服務回傳格式錯誤（HTTP "+resp.status+"）");}
    if(!resp.ok||r.error)throw new Error(r.error||("監測服務暫時異常（HTTP "+resp.status+"）"));
    var notes=r.notes||[];
    if(!notes.length){box.innerHTML='<div class="hint">目前沒有偵測到變化。（cron 跑過、且有變動才會出現）</div>';return;}
    box.innerHTML=notes.map(function(n){
      var d=new Date(n.at);var ds=(d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
      var safe=/^https:\/\//i.test(String(n.url||""))?String(n.url):"";
      return '<div class="mon-note"><b>'+esc(n.label||n.url)+'</b> <span style="opacity:.6">'+ds+'</span>\n'+esc(n.headline||"")+(safe?'\n<a class="srclink" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(safe)+'</a>':'')+'</div>';
    }).join("");
  }catch(e){box.innerHTML='<div class="err">'+esc(e.message||e)+'</div>';}
};

/* ---------- 6. 演算法分頁功能 ---------- */
window.algoGo=async function(){
  var mode=window._algoMode||"fixed";
  var task=val("algo_task");
  var out=document.getElementById("algoOut");
  var btn=document.getElementById("algoRun");if(btn)btn.disabled=true;
  out.innerHTML='<div class="status">📐 分析中…'+(mode==="live"?'（上網查最新，約 30~60 秒）':'')+'</div>';
  try{
    var data=await callAPI("/algo",{mode:mode,task:task,profile:getProfile(),today:localDateKey(),timezone:"Asia/Taipei"});
    var r=data.result||{};
    var text=r.analysis||"";
    var html='<div class="out">'+esc(text)+'</div><button class="copy" onclick="cp(this)">📋 複製</button>';
    if(r.sources&&r.sources.length){
      html+='<div class="datapack"><span class="dp-h">📎 資料來源</span>'+
        r.sources.map(function(s){var u=/^https:\/\//i.test(String(s.url||""))?String(s.url):"";return u?'<a class="srclink" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||u)+'</a>':'';}).join("")+'</div>';
    }
    out.innerHTML=html;
  }catch(e){ if(typeof showErr==="function") showErr("algoOut",e.message||e); else out.innerHTML='<div class="err">'+esc(e.message||e)+'</div>'; }
  if(btn)btn.disabled=false;
};
window.algoVision=function(ev){
  var f=ev.target.files[0];if(!f)return;
  var out=document.getElementById("algoOut");out.innerHTML='<div class="status">📐 讀圖分析中…</div>';
  // 沿用原檔的壓縮函式
  fileToCompressedBase64(f,async function(b64){
    try{
      var data=await callAPI("/algo",{mode:"vision",image:b64,mediaType:"image/jpeg",profile:getProfile(),today:localDateKey(),timezone:"Asia/Taipei"});
      var r=data.result||"";
      var text=(typeof r==="string")?r:(r.analysis||JSON.stringify(r));
      out.innerHTML='<div class="out">'+esc(text)+'</div><button class="copy" onclick="cp(this)">📋 複製</button>';
    }catch(e){ out.innerHTML='<div class="err">'+esc(e.message||e)+'</div>'; }
    finally{ev.target.value="";}
  },function(er){ out.innerHTML='<div class="err">'+esc(er)+'</div>'; });
};

/* ---------- 小工具 ---------- */
function val(id){var e=document.getElementById(id);return e?String(e.value).trim():"";}

/* ---------- 7. 攔 callAPI 回傳，記住 dataPack 供方向/整合使用 ---------- */
// 原 stage1 呼叫 /opinions 會回 dataPack；這裡包一層 callAPI 記住最後一次 dataPack
if(typeof window.callAPI==="function"){
  var _callAPI=window.callAPI;
  window.callAPI=async function(path,payload){
    var data=await _callAPI(path,payload);
    if(path.indexOf("/opinions")>=0 && data && data.dataPack){
      window._lastDataPack=data.dataPack;
      showDataPack(data.dataPack, data.autoCollected);
    }
    return data;
  };
}
function showDataPack(pack, auto){
  var host=document.getElementById("opin");if(!host)return;
  var old=document.getElementById("datapackBox");if(old)old.remove();
  var box=document.createElement("div");box.className="datapack";box.id="datapackBox";
  var srcHtml="";
  if(auto&&auto.sources&&auto.sources.length){
    srcHtml="\n"+auto.sources.map(function(s){return "· "+(s.title||s.url);}).join("\n");
  }
  box.innerHTML='<span class="dp-h">📡 蒐集員找到的即時資料（顧問據此發言）</span>'+esc(pack)+esc(srcHtml);
  host.parentNode.insertBefore(box, host);
}

})();
