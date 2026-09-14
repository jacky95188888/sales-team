/* ============================================================
 * AI 多品牌營運總部
 * ------------------------------------------------------------
 * 以附加頁方式串接現有 /content、/execute 能力，不覆寫原功能。
 * 任務、產品快照與產出先存於本機；正式跨裝置排程需 Worker 支援。
 * ============================================================ */
(function () {
  "use strict";

  var KEY = "advisor_hq_tasks_v1";
  var WORKSPACE_KEY = "advisor_hq_workspace_v1";
  var MODE_KEY = "advisor_hq_approval_mode_v1";
  var PRESENTERS_KEY = "advisor_hq_presenters_v1";
  var ACTIVE_PRESENTER_KEY = "advisor_hq_active_presenter_v1";
  var PRODUCTION_KEY = "advisor_hq_production_profiles_v1";
  var currentRunId = null;
  var cloudBusy = false;
  var videoConfigState = { ready: false, apiReady: false, apiValid: false, ownerReady: false, creditReady: true, billing: null, avatarReady: false, avatar: null, voiceReady: false, voice: null };
  var publishConfigState = {
    youtube: { credentialsReady: false, connected: false, account: null, privacyOptions: ["private", "unlisted", "public"] },
    tiktok: { credentialsReady: false, connected: false, account: null, privacyOptions: [] }
  };
  var videoPollers = {};
  var avatarPoller = null;
  var voicePoller = null;
  var mediaRecorder = null;
  var voiceChunks = [];
  var recordedVoice = null;
  var assetLibrary = [];
  var CHANNELS = [
    { id: "thread", label: "Threads 貼文" },
    { id: "fb", label: "Facebook 長文" },
    { id: "video", label: "Reels／Shorts 短影音" },
    { id: "tiktok", label: "TikTok 直式影片" },
    { id: "youtube", label: "YouTube 完整影片" },
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
    id = "hq_" + Array.from(bytes).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    try { localStorage.setItem(WORKSPACE_KEY, id); } catch (_) {}
    return id;
  }
  function approvalMode() {
    try { return localStorage.getItem(MODE_KEY) === "auto" ? "auto" : "review"; }
    catch (_) { return "review"; }
  }
  function saveApprovalMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode === "auto" ? "auto" : "review"); }
    catch (_) {}
  }
  function currentProduct() {
    try { return typeof currentProductObj === "function" ? currentProductObj() : null; }
    catch (_) { return null; }
  }
  function readJson(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key) || "null"); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function presenterProfiles() {
    var rows = readJson(PRESENTERS_KEY, []);
    if (!Array.isArray(rows) || !rows.length) {
      var profile = typeof getProfile === "function" ? (getProfile() || {}) : {};
      rows = [{ id: "default", name: profile.name || profile.ownerName || "目前人物", appearancePrompt: "保留參考照片本人的臉部與身份特徵，專業、自然、真實比例" }];
      try { localStorage.setItem(PRESENTERS_KEY, JSON.stringify(rows)); } catch (_) {}
    }
    return rows.slice(0, 20);
  }
  function activePresenterId() {
    var rows = presenterProfiles(), id = "default";
    try { id = localStorage.getItem(ACTIVE_PRESENTER_KEY) || "default"; } catch (_) {}
    return rows.some(function (row) { return row.id === id; }) ? id : rows[0].id;
  }
  function activePresenter() {
    var id = activePresenterId();
    return presenterProfiles().find(function (row) { return row.id === id; }) || presenterProfiles()[0];
  }
  function productKey(product) {
    return String(product && (product.p_name || product.name) || "default").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff_-]+/g, "-").slice(0, 80) || "default";
  }
  function productionProfile(product) {
    var all = readJson(PRODUCTION_KEY, {}), key = productKey(product), saved = all[key] || {};
    return {
      brandStyle: saved.brandStyle || "依產品定位自動建立一致的品牌視覺",
      callToAction: saved.callToAction || "依內容提供一個自然、可執行的下一步",
      totalSeconds: Math.max(15, Math.min(35, Number(saved.totalSeconds) || 30)),
      presenterSeconds: Math.max(0, Math.min(12, Number(saved.presenterSeconds) || 9))
    };
  }
  function currentProductionProfile() {
    var p = currentProduct(), base = productionProfile(p);
    var brand = document.getElementById("hqBrandStyle"), cta = document.getElementById("hqCTA"), total = document.getElementById("hqTotalSeconds"), presenter = document.getElementById("hqPresenterSeconds");
    if (brand) base.brandStyle = String(brand.value || base.brandStyle).trim().slice(0, 500);
    if (cta) base.callToAction = String(cta.value || base.callToAction).trim().slice(0, 500);
    if (total) base.totalSeconds = Math.max(15, Math.min(35, Number(total.value) || base.totalSeconds));
    if (presenter) base.presenterSeconds = Math.max(0, Math.min(12, Number(presenter.value) || base.presenterSeconds));
    base.presenterSeconds = Math.min(base.presenterSeconds, base.totalSeconds);
    return base;
  }
  function saveProductionProfile() {
    var p = currentProduct(); if (!p) return;
    var all = readJson(PRODUCTION_KEY, {}); all[productKey(p)] = currentProductionProfile();
    try { localStorage.setItem(PRODUCTION_KEY, JSON.stringify(all)); } catch (_) {}
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
      reviewing: "AI 品質審核中", revising: "內容員自動修改中", approval: "腳本等待你批准", video_review: "影片成品待你驗收", returned: "退回修改",
      scheduled: "已批准・等待發布", done: "已完成", failed: "需要處理"
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
  function syncConfig(selectedChannels) {
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
      approvalMode: approvalMode(),
      profile: typeof getProfile === "function" ? getProfile() : {},
      product: product,
      presenter: activePresenter(),
      production: currentProductionProfile(),
      autoVideoEnabled: approvalMode() === "auto" && !!(document.getElementById("hqAutoPaidVideo") && document.getElementById("hqAutoPaidVideo").checked),
      autoPublishEnabled: approvalMode() === "auto" && !!(document.getElementById("hqAutoPublish") && document.getElementById("hqAutoPublish").checked),
      publishPrivacy: {
        youtube: String(document.getElementById("hqYoutubePrivacy") && document.getElementById("hqYoutubePrivacy").value || "private"),
        tiktok: String(document.getElementById("hqTiktokPrivacy") && document.getElementById("hqTiktokPrivacy").value || "")
      },
      channels: Array.isArray(selectedChannels) && selectedChannels.length ? selectedChannels : ["thread", "fb", "video"]
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

  async function videoAPI(path, payload) {
    var response = await fetch(WORKER_URL.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    var data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
  function publisherLabel(provider) { return provider === "youtube" ? "YouTube" : "TikTok"; }
  function publisherStateText(provider) {
    var item = publishConfigState[provider] || {};
    if (!item.credentialsReady) return "尚未加入平台開發者憑證";
    if (!item.connected) return "尚未授權帳號";
    if (item.error) return "授權需要更新：" + item.error;
    return "✅ 已連接" + (item.account && item.account.name ? "「" + item.account.name + "」" : "帳號");
  }
  function renderPublisherState() {
    ["youtube", "tiktok"].forEach(function (provider) {
      var item = publishConfigState[provider] || {}, state = document.getElementById("hq" + (provider === "youtube" ? "Youtube" : "Tiktok") + "State");
      var button = document.getElementById("hq" + (provider === "youtube" ? "Youtube" : "Tiktok") + "Connect");
      if (state) state.textContent = publisherStateText(provider);
      if (button) {
        button.textContent = item.connected ? "解除連線" : "連接 " + publisherLabel(provider);
        button.dataset.connected = item.connected ? "1" : "0";
        button.disabled = !item.credentialsReady;
      }
    });
    var select = document.getElementById("hqTiktokPrivacy"), options = publishConfigState.tiktok && publishConfigState.tiktok.privacyOptions || [];
    if (select) {
      var current = select.value;
      select.innerHTML = '<option value="">發布前選擇可見度</option>' + options.map(function (value) {
        var labels = { PUBLIC_TO_EVERYONE: "所有人可見", MUTUAL_FOLLOW_FRIENDS: "互相關注好友", FOLLOWER_OF_CREATOR: "粉絲可見", SELF_ONLY: "僅自己可見" };
        return '<option value="' + E(value) + '"' + (value === current ? ' selected' : '') + '>' + E(labels[value] || value) + '</option>';
      }).join("");
      select.disabled = !publishConfigState.tiktok.connected || !options.length;
    }
  }
  function checkPublishConfig(refresh) {
    return videoAPI("/publish-config", { workspaceId: workspaceId(), refresh: refresh === true }).then(function (data) {
      publishConfigState = data.platforms || publishConfigState;
      renderPublisherState(); render();
    }).catch(function () {});
  }
  async function connectPublisher(provider) {
    var item = publishConfigState[provider] || {};
    if (item.connected) {
      if (!confirm("確定解除 " + publisherLabel(provider) + " 發布授權？之後將無法自動發布，直到重新連接。")) return;
      try {
        await videoAPI("/oauth-disconnect", { workspaceId: workspaceId(), provider: provider });
        await checkPublishConfig(false);
      } catch (err) { alert(String(err && err.message ? err.message : err)); }
      return;
    }
    try {
      var data = await videoAPI("/oauth-start", { workspaceId: workspaceId(), provider: provider });
      window.location.assign(data.authUrl);
    } catch (err) { alert(String(err && err.message ? err.message : err)); }
  }
  function mergePublishJob(taskId, provider, job) {
    var task = findTask(taskId); if (!task) return;
    var jobs = Object.assign({}, task.publishJobs || {}); jobs[provider] = job;
    updateTask(taskId, { publishJobs: jobs }); render();
  }
  async function publishTaskVideo(taskId, provider) {
    var task = findTask(taskId); if (!task) return;
    var privacy = provider === "youtube"
      ? String(document.getElementById("hqYoutubePrivacy") && document.getElementById("hqYoutubePrivacy").value || "private")
      : String(document.getElementById("hqTiktokPrivacy") && document.getElementById("hqTiktokPrivacy").value || "");
    if (provider === "tiktok" && !privacy) { alert("請先在發布連線區選擇 TikTok 可見度。"); return; }
    var visibility = { private: "私人", unlisted: "不公開列出", public: "公開", SELF_ONLY: "僅自己可見", MUTUAL_FOLLOW_FRIENDS: "互相關注好友", PUBLIC_TO_EVERYONE: "所有人可見" }[privacy] || privacy;
    if (!confirm("確定把這支影片發布到 " + publisherLabel(provider) + "？\n可見度：" + visibility)) return;
    mergePublishJob(taskId, provider, { provider: provider, status: "uploading", privacy: privacy, startedAt: Date.now() });
    try {
      var data = await videoAPI("/publish-video", { workspaceId: workspaceId(), taskId: taskId, provider: provider, privacy: privacy });
      mergePublishJob(taskId, provider, data.job);
    } catch (err) {
      mergePublishJob(taskId, provider, { provider: provider, status: "failed", privacy: privacy, failure: String(err && err.message ? err.message : err), updatedAt: Date.now() });
      alert(String(err && err.message ? err.message : err));
    }
  }
  async function pollPublish(taskId, provider) {
    try {
      var data = await videoAPI("/publish-status", { workspaceId: workspaceId(), taskId: taskId, provider: provider });
      mergePublishJob(taskId, provider, data.job);
    } catch (err) { alert(String(err && err.message ? err.message : err)); }
  }
  function videoStateText() {
    var billing = videoConfigState.billing;
    var balance = "";
    if (billing && billing.type === "wallet" && billing.remaining != null)
      balance = "・API 餘額 " + billing.remaining + " " + (billing.currency || "credits");
    if (billing && billing.type === "subscription")
      balance = "・API 點數 " + ((billing.premium || 0) + (billing.addOn || 0));
    if (videoConfigState.ready) return "✅ HeyGen MP4 引擎與「" + activePresenter().name + "」已就緒" + balance;
    if (!videoConfigState.apiReady) return "⚠️ HeyGen MP4 引擎尚未啟用";
    if (!videoConfigState.apiValid) return "❌ HeyGen API 金鑰驗證失敗";
    if (videoConfigState.creditReady === false) return "❌ 目前這把 API Key 的可用餘額不足 0.5" + balance;
    if (!videoConfigState.ownerReady) return "⚠️ 目前同步碼尚未取得影片權限";
    if (!videoConfigState.avatarReady) return "⚠️ 請先建立目前所選人物，完成前不會產片或扣影片點數" + balance;
    return "⚠️ 影片引擎尚未完成設定";
  }
  function avatarStateText() {
    var a = videoConfigState.avatar;
    if (!a) return "尚未建立。請為「" + activePresenter().name + "」選擇正面照片。";
    if (a.status === "ready") return "✅ 「" + activePresenter().name + "」已完成，新任務可選用這個人物。";
    if (a.status === "building_style") return "⏳ 臉部已建立，正在製作人物造型。";
    if (a.status === "building_face") return "⏳ 正在建立人物臉部，完成後會自動製作造型。";
    if (a.status === "failed") return "❌ 人物建立失敗：" + (a.failure || "請換一張正面照片重試");
    return "⏳ 專屬人物處理中。";
  }
  function renderAvatarState() {
    var a = videoConfigState.avatar;
    var state = document.getElementById("hqAvatarState");
    var preview = document.getElementById("hqAvatarPreview");
    if (state) state.textContent = avatarStateText();
    if (preview) {
      preview.style.display = a && a.previewImageUrl ? "block" : "none";
      if (a && a.previewImageUrl) preview.src = a.previewImageUrl;
    }
  }
  function voiceStateText() {
    var voice = videoConfigState.voice;
    if (!voice) return "尚未建立；新影片會先使用 HeyGen 預設聲音。";
    if (voice.status === "ready") return "✅ 「" + activePresenter().name + "」的聲音已完成，之後的新影片可選用。";
    if (voice.status === "failed") return "❌ 聲音建立失敗：" + (voice.failure || "請重新錄製");
    return "⏳ HeyGen 正在建立「" + activePresenter().name + "」的聲音。";
  }
  function renderVoiceState() {
    var state = document.getElementById("hqVoiceState");
    if (state) state.textContent = voiceStateText();
  }
  function renderAssetLibrary() {
    var host = document.getElementById("hqAssetLibrary"); if (!host) return;
    host.innerHTML = assetLibrary.length ? assetLibrary.map(function (asset) {
      return '<label class="hq-assetchip"><input type="checkbox" data-hq-asset="' + E(asset.id) + '"><span>' + E(asset.name || "常用素材") + '</span></label>';
    }).join("") : '<span class="hq-note">目前沒有常用素材。</span>';
  }
  async function loadAssetLibrary() {
    try {
      var data = await videoAPI("/media-assets", { action: "list", workspaceId: workspaceId() });
      assetLibrary = Array.isArray(data.assets) ? data.assets : [];
      renderAssetLibrary();
    } catch (_) { renderAssetLibrary(); }
  }
  function scheduleVoicePoll() {
    if (voicePoller) clearTimeout(voicePoller);
    voicePoller = setTimeout(function () { pollVoice(true); }, 15000);
  }
  async function pollVoice(quiet) {
    try {
      var data = await videoAPI("/voice-status", { workspaceId: workspaceId(), profileId: activePresenterId() });
      videoConfigState.voice = data.voice;
      videoConfigState.voiceReady = !!(data.voice && data.voice.status === "ready");
      renderVoiceState();
      if (data.voice && data.voice.status === "processing") scheduleVoicePoll();
    } catch (err) { if (!quiet) alert(String(err && err.message ? err.message : err)); }
  }
  function blobPayload(blob, name) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onerror = reject;
      reader.onload = function () { resolve({ data: String(reader.result || "").split(",")[1] || "", mediaType: String(blob.type || "audio/webm").split(";")[0].toLowerCase(), name: name || "material" }); };
      reader.readAsDataURL(blob);
    });
  }
  async function toggleVoiceRecording(button) {
    if (mediaRecorder && mediaRecorder.state === "recording") { mediaRecorder.stop(); button.disabled = true; return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { alert("這個瀏覽器無法直接錄音，請改用 iPhone 鍵盤的麥克風輸入陳述。"); return; }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunks = []; recordedVoice = null;
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) voiceChunks.push(ev.data); };
      mediaRecorder.onstop = function () {
        recordedVoice = new Blob(voiceChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        stream.getTracks().forEach(function (track) { track.stop(); });
        var preview = document.getElementById("hqVoicePreview");
        preview.src = URL.createObjectURL(recordedVoice); preview.style.display = "block";
        button.disabled = false; button.textContent = "● 重新錄音"; button.classList.remove("hq-recording");
        document.getElementById("hqVoiceCreate").disabled = recordedVoice.size < 1000;
      };
      mediaRecorder.start(); button.textContent = "■ 停止錄音"; button.classList.add("hq-recording");
    } catch (_) { alert("沒有取得麥克風權限，請在瀏覽器設定允許麥克風後再試。"); }
  }
  async function createVoice() {
    if (!recordedVoice) return;
    saveCurrentSetup();
    var button = document.getElementById("hqVoiceCreate"); button.disabled = true; button.textContent = "聲音上傳中…";
    try {
      var presenter = activePresenter(), payload = await blobPayload(recordedVoice, presenter.id + "-voice");
      if (payload.data.length > 6000000) throw new Error("錄音超過 4.5MB，請縮短後重錄。");
      var data = await videoAPI("/voice-create", { workspaceId: workspaceId(), profileId: presenter.id, profileName: presenter.name, audio: payload.data, mediaType: payload.mediaType });
      videoConfigState.voice = data.voice; videoConfigState.voiceReady = false; renderVoiceState(); scheduleVoicePoll();
    } catch (err) { alert(String(err && err.message ? err.message : err)); }
    finally { button.disabled = false; button.textContent = "建立長期專屬聲音"; }
  }
  function startDictation(button) {
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { alert("這個瀏覽器沒有語音轉文字，請使用 iPhone 鍵盤右下角的麥克風說話。"); return; }
    var recognition = new Recognition(); recognition.lang = "zh-TW"; recognition.interimResults = true; recognition.continuous = false;
    var area = document.getElementById("hqStatement"), original = area.value;
    recognition.onstart = function () { button.textContent = "正在聽你說…"; button.classList.add("hq-recording"); };
    recognition.onresult = function (event) {
      var spoken = Array.from(event.results).map(function (row) { return row[0].transcript; }).join("");
      area.value = (original ? original + "\n" : "") + spoken;
      var own = document.querySelector('input[name="hqContentMode"][value="statement"]'); if (own) own.checked = true;
    };
    recognition.onerror = function () { alert("語音辨識沒有成功，請再按一次或使用鍵盤麥克風。"); };
    recognition.onend = function () { button.textContent = "🎙️ 用說的輸入"; button.classList.remove("hq-recording"); };
    recognition.start();
  }
  function checkVideoConfig() {
    if (typeof callAPI !== "function") return Promise.resolve();
    return callAPI("/video-config", { workspaceId: workspaceId(), profileId: activePresenterId() }).then(function (data) {
      videoConfigState = data || videoConfigState;
      var el = document.getElementById("hqVideoState");
      if (el) el.textContent = videoStateText();
      renderAvatarState();
      renderVoiceState();
      if (data.voice && data.voice.status === "processing") scheduleVoicePoll();
      if (data.avatar && ["building_face", "building_style"].indexOf(data.avatar.status) >= 0)
        scheduleAvatarPoll();
      render();
    }).catch(function () {});
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
      .hq-task{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:12px;margin-bottom:9px;min-width:0;overflow:hidden}.hq-tasktop{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;min-width:0}.hq-tasktop>div{min-width:0}.hq-task h3{font-size:.9rem;color:var(--ink);line-height:1.45;word-break:break-word;overflow-wrap:anywhere}.hq-state{font-size:.68rem;color:#9dc8ff;white-space:nowrap;flex-shrink:0}.hq-state.approval,.hq-state.video_review{color:#ffd27a}.hq-state.failed{color:#ffaaa4}.hq-meta{font-size:.7rem;color:var(--ink-soft);margin-top:4px;word-break:break-word;overflow-wrap:anywhere}.hq-flow{display:flex;gap:3px;margin-top:9px}.hq-step{height:4px;flex:1;border-radius:9px;background:rgba(255,255,255,.12)}.hq-step.on{background:linear-gradient(90deg,var(--gold-dk),var(--gold-lt))}
      .hq-minirow{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.hq-mini{border:1px solid var(--purple);border-radius:9px;padding:7px 9px;background:#2c1f4d;color:var(--ink);font-size:.72rem}.hq-mini.primary{border-color:var(--gold);color:#3a2400;background:linear-gradient(180deg,var(--gold-lt),var(--gold-dk));font-weight:700}
      .hq-mini:disabled{opacity:.55;filter:saturate(.5)}
      .hq-channels{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.hq-check{display:flex;align-items:center;gap:7px;padding:9px;border:1px solid rgba(169,139,216,.25);border-radius:10px;background:rgba(20,13,38,.45);font-size:.76rem;color:var(--ink-soft)}.hq-check input{width:17px;height:17px;accent-color:var(--gold-dk)}
      .hq-note{font-size:.73rem;color:var(--ink-soft);margin-top:8px}.hq-error{font-size:.74rem;color:#ffb3b3;margin-top:8px;white-space:pre-wrap}.hq-working{font-size:.78rem;color:var(--gold-lt);padding:9px 0;text-align:center}
      .hq-output{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:9px}.hq-output summary{color:var(--gold-lt);font-size:.78rem;cursor:pointer}.hq-output pre{white-space:pre-wrap;font-family:inherit;font-size:.78rem;color:var(--ink);margin-top:7px;max-height:280px;overflow:auto}.hq-output .copy{margin-top:7px}
      .hq-videoengine{margin-top:8px;padding:8px 9px;border-radius:9px;border:1px solid rgba(255,202,95,.3);background:rgba(255,202,95,.07);font-size:.7rem;color:#f2d996}.hq-videoengine b{color:var(--gold-lt)}
      .hq-videobox{margin-top:8px;padding:9px;border-radius:10px;background:rgba(8,7,18,.42);border:1px solid rgba(145,215,180,.22)}.hq-videobox video{display:block;width:100%;max-height:360px;border-radius:9px;background:#000;margin-top:8px}.hq-videobox a{display:inline-block;margin-top:8px;color:var(--gold-lt)}.hq-videostatus{font-size:.72rem;color:#91d7b4}.hq-mini[href]{text-decoration:none;display:inline-flex;align-items:center}
      .hq-publish{margin-top:10px;padding:11px;border:1px solid rgba(97,190,255,.32);border-radius:12px;background:linear-gradient(135deg,rgba(15,34,65,.76),rgba(39,22,67,.72))}.hq-publish>strong{display:block;color:var(--gold-lt);font-size:.8rem;margin-bottom:8px}.hq-publishrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid rgba(255,255,255,.08)}.hq-publishrow:first-of-type{border-top:0}.hq-publishname{font-size:.74rem;color:var(--ink);font-weight:750}.hq-publishstate{display:block;margin-top:2px;font-size:.64rem;color:var(--ink-soft);overflow-wrap:anywhere}.hq-publishselects{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.hq-publishselects label{font-size:.62rem;color:var(--ink-soft)}.hq-publishselects select{display:block;width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid rgba(169,139,216,.3);background:#160f2b;color:var(--ink);font-size:.68rem}.hq-publishnote{margin-top:7px;font-size:.63rem;line-height:1.45;color:var(--ink-soft)}.hq-publishjob{margin-top:7px;padding:8px;border-radius:8px;background:rgba(8,7,18,.4);font-size:.68rem;color:#91d7b4}.hq-publishjob.failed{color:#ffaaa4}
      .hq-mode{display:block!important;width:100%!important;min-width:0!important;margin-top:10px;padding:10px;border:1px solid rgba(169,139,216,.28);border-radius:11px;background:rgba(20,13,38,.48);overflow:hidden}.hq-mode b{display:block;color:var(--gold-lt);font-size:.78rem;margin-bottom:7px}.hq-mode label{display:grid!important;grid-template-columns:22px minmax(0,1fr)!important;align-items:flex-start!important;gap:9px!important;width:100%!important;min-width:0!important;min-height:0!important;padding:9px 4px!important;color:var(--ink);font-size:.75rem;line-height:1.45;writing-mode:horizontal-tb!important;white-space:normal!important}.hq-mode input[type=radio]{display:block!important;width:20px!important;height:20px!important;min-width:20px!important;margin:2px 0 0!important;accent-color:var(--gold-dk)}.hq-mode label span,.hq-mode small{display:block!important;width:auto!important;min-width:0!important;writing-mode:horizontal-tb!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important}.hq-mode small{color:var(--ink-soft);font-size:.67rem;margin-top:2px}
      .hq-avatar{margin-top:10px;padding:11px;border:1px solid rgba(232,194,103,.34);border-radius:12px;background:linear-gradient(135deg,rgba(17,29,53,.76),rgba(42,25,68,.72))}.hq-avatarhead{display:flex;gap:10px;align-items:center}.hq-avatarhead img{width:58px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(232,194,103,.55)}.hq-avatarhead b{display:block;color:var(--gold-lt);font-size:.8rem}.hq-avatarhead span{display:block;color:var(--ink-soft);font-size:.7rem;line-height:1.45;margin-top:3px}.hq-avatarcontrols{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px}.hq-avatarcontrols input{font-size:.68rem;color:var(--ink-soft);max-width:100%}.hq-avatarcontrols button{margin:0}.hq-avatarprivacy{font-size:.64rem;color:var(--ink-soft);margin-top:7px}
      .hq-compose{margin-top:10px;padding:11px;border:1px solid rgba(169,139,216,.3);border-radius:12px;background:rgba(20,13,38,.42)}.hq-compose>strong{display:block;color:var(--gold-lt);font-size:.8rem;margin-bottom:7px}.hq-choice{display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px;align-items:start;padding:7px 0;font-size:.74rem;color:var(--ink)}.hq-choice input{width:19px!important;height:19px!important;min-width:19px!important;margin:1px 0 0!important;accent-color:var(--gold-dk)}.hq-choice small{display:block;color:var(--ink-soft);font-size:.64rem;margin-top:2px}.hq-statement{min-height:92px;margin-top:7px}.hq-subtools{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.hq-subtools button{margin:0}.hq-materials{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}.hq-materials>summary{cursor:pointer;color:var(--gold-lt);font-size:.74rem;font-weight:800}.hq-materials[open]>summary{margin-bottom:8px}.hq-materials input[type=file]{font-size:.68rem;margin-top:7px}.hq-assets{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.hq-assetchip{display:grid;grid-template-columns:17px minmax(0,1fr);gap:5px;align-items:center;max-width:100%;padding:6px 8px;border:1px solid rgba(169,139,216,.28);border-radius:8px;font-size:.65rem;color:var(--ink-soft)}.hq-assetchip input{width:16px!important;height:16px!important;margin:0!important}.hq-voiceplayer{width:100%;height:36px;margin-top:7px}.hq-recording{color:#ffaaa4!important;border-color:#e66!important}.hq-scope{display:flex;gap:12px;flex-wrap:wrap;margin-top:7px}.hq-scope label{display:flex;align-items:center;gap:5px;font-size:.67rem;color:var(--ink-soft)}.hq-scope input{width:17px!important;height:17px!important;margin:0!important}
      .hq-cost{margin-top:8px;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,190,105,.42);background:rgba(73,43,17,.42);color:var(--gold-lt);font-size:.7rem;line-height:1.5}.hq-cost strong{font-size:.77rem}.hq-usage{margin-top:8px;padding:9px;border-radius:10px;background:rgba(8,7,18,.42);font-size:.68rem;color:var(--ink-soft);overflow-wrap:anywhere}.hq-usage b{color:var(--gold-lt)}.hq-paidtoggle{display:grid!important;grid-template-columns:20px minmax(0,1fr)!important;gap:8px!important;align-items:start!important;width:100%!important;padding:9px!important;margin-top:7px;border:1px dashed rgba(232,194,103,.38);border-radius:9px}.hq-paidtoggle input{width:19px!important;height:19px!important;margin:1px 0 0!important}.hq-paidtoggle span{min-width:0!important;writing-mode:horizontal-tb!important;white-space:normal!important;overflow-wrap:anywhere!important}
      .hq-now{margin-top:10px;padding:10px 11px;border-radius:11px;background:linear-gradient(135deg,rgba(232,194,103,.14),rgba(72,48,112,.28));border:1px solid rgba(232,194,103,.36)}.hq-nowtop{display:flex;align-items:center;justify-content:space-between;gap:8px}.hq-nowstep{font-size:.68rem;color:var(--gold-lt);font-weight:800}.hq-nowwork{font-size:.76rem;color:var(--ink);font-weight:750;margin-top:3px;line-height:1.4}.hq-next{font-size:.65rem;color:var(--ink-soft);margin-top:3px}.hq-crew{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:9px}.hq-person{text-align:center;min-width:0;opacity:.4;transition:.2s}.hq-person.done{opacity:.72}.hq-person.active{opacity:1;transform:translateY(-2px)}.hq-personpic{width:42px;height:42px;margin:0 auto;border-radius:50%;padding:2px;background:rgba(169,139,216,.38);position:relative;display:grid;place-items:center}.hq-personpic img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}.hq-person.active .hq-personpic{width:50px;height:50px;background:linear-gradient(145deg,var(--gold-lt),var(--gold-dk));box-shadow:0 0 15px rgba(232,194,103,.72)}.hq-person.done .hq-personpic::after{content:'✓';position:absolute;right:-2px;bottom:-2px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:#72c69b;color:#10281e;font-size:.6rem;font-weight:900;border:1px solid #d8ffe9}.hq-personname{font-size:.56rem;color:var(--ink-soft);line-height:1.2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hq-person.active .hq-personname{color:var(--gold-lt);font-weight:800}.hq-phasebar{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px}.hq-phasebar i{height:5px;border-radius:8px;background:rgba(255,255,255,.11)}.hq-phasebar i.done{background:rgba(232,194,103,.58)}.hq-phasebar i.active{background:linear-gradient(90deg,var(--gold),#fff0b4);box-shadow:0 0 7px rgba(232,194,103,.55)}.lineup.hq-hidden{display:none!important}
      .hq-quality{margin-top:9px;border-radius:10px;padding:9px;background:rgba(20,13,38,.45);font-size:.72rem;color:var(--ink-soft)}.hq-quality b{color:var(--gold-lt)}
      .hq-focus{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 12px;border:1px solid rgba(232,194,103,.42);border-radius:15px;background:linear-gradient(135deg,rgba(52,34,85,.96),rgba(25,17,47,.96));box-shadow:0 8px 22px rgba(0,0,0,.24)}.hq-focuspic{width:52px;height:52px;flex:0 0 52px;border-radius:50%;padding:2px;background:linear-gradient(145deg,var(--gold-lt),var(--gold-dk));box-shadow:0 0 13px rgba(232,194,103,.45)}.hq-focuspic img{display:block;width:100%;height:100%;border-radius:50%;object-fit:cover}.hq-focusbody{min-width:0;flex:1}.hq-focuslabel{font-size:.63rem;color:var(--gold-lt);font-weight:800}.hq-focustext{font-size:.76rem;color:var(--ink);line-height:1.45;font-weight:750;margin-top:2px}.hq-focusnext{font-size:.64rem;color:var(--ink-soft);line-height:1.35;margin-top:2px}.hq-focus button{flex:0 0 auto;margin:0;padding:7px 9px;white-space:nowrap}.hq-archive{margin-top:10px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px}.hq-archive>summary{cursor:pointer;color:var(--ink-soft);font-size:.74rem;list-style-position:inside}.hq-archive[open]>summary{margin-bottom:9px;color:var(--gold-lt)}.hq-actionnote{font-size:.63rem;color:var(--ink-soft);margin-top:6px}
      .hq-empty{text-align:center;color:var(--ink-soft);font-size:.78rem;padding:18px 8px}.hq-danger{color:#ff9e98!important}
      .hq-cloud{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding:9px 10px;border-radius:11px;background:rgba(20,13,38,.5);border:1px solid rgba(145,215,180,.24);font-size:.7rem;color:#91d7b4}.hq-cloud button{border:1px solid rgba(169,139,216,.45);border-radius:8px;background:#2c1f4d;color:var(--ink);padding:5px 8px;font-size:.66rem}.hq-syncbox{display:none;margin-top:8px}.hq-syncbox.on{display:flex;gap:6px}.hq-syncbox input{min-width:0;flex:1;margin:0;padding:8px;font-size:.72rem}.hq-syncbox button{margin:0;width:auto;padding:8px 10px}
      .hq-config{margin:0 0 12px;padding:11px;border:1px solid rgba(232,194,103,.3);border-radius:12px;background:rgba(20,13,38,.42)}.hq-config h3{color:var(--gold-lt);font-size:.82rem;margin:0 0 9px}.hq-configgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hq-field{min-width:0}.hq-field.wide{grid-column:1/-1}.hq-field label{display:block;font-size:.64rem;color:var(--ink-soft);margin-bottom:4px}.hq-field input,.hq-field select,.hq-field textarea{width:100%;min-width:0;margin:0;padding:9px;border-radius:9px;border:1px solid rgba(169,139,216,.28);background:rgba(12,8,25,.65);color:var(--ink);font-size:.72rem;box-sizing:border-box}.hq-field textarea{min-height:64px}.hq-configactions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      @media(max-width:420px){.hq-focus{align-items:flex-start;flex-wrap:wrap}.hq-focusbody{width:calc(100% - 64px)}.hq-focus button{width:100%;margin-left:62px}.hq-head{display:block}.hq-live{display:inline-block;margin-top:7px}}
      @media(max-width:420px){.hq-configgrid{grid-template-columns:1fr}.hq-field.wide{grid-column:auto}}
      @media(max-width:420px){.hq-publishselects{grid-template-columns:1fr}}
      @media(max-width:360px){.hq-points{grid-template-columns:1fr}.hq-channels{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function pageHtml() {
    return '<div class="hq-hero">' +
      '<div class="hq-head"><div><h2>🏢 AI 多品牌營運總部</h2><p>人物、產品、聲音與品牌設定皆可自由切換</p></div><span class="hq-live">● 通用製作產線</span></div>' +
      '<div class="hq-product" id="hqProduct"></div>' +
      '<div class="hq-cloud"><span id="hqCloudState">☁️ 雲端同步連線中</span><button id="hqSyncTools">同步工具</button></div>' +
      '<div class="hq-syncbox" id="hqSyncBox"><input id="hqWorkspaceInput" placeholder="貼上另一台裝置的同步碼"><button class="btn2" id="hqUseWorkspace">切換</button></div>' +
      '<div class="hq-note">⏰ 自動營運：每天 09:00 情報・14:00 內容・21:00 覆盤</div>' +
      '<div class="hq-points"><div class="hq-point"><b id="hqMorning">0</b><span>上午商機</span></div><div class="hq-point"><b id="hqAfternoon">0</b><span>下午產出</span></div><div class="hq-point"><b id="hqEvening">0</b><span>晚上覆盤</span></div></div>' +
    '</div>' +
    '<div id="hqActiveNow"></div>' +
    '<div class="panel"><div class="hq-titleline"><label class="lbl">👑 等待老闆批准</label><span class="hq-count" id="hqApprovalCount">0 件</span></div><div id="hqApprovals"></div></div>' +
    '<div class="panel"><label class="lbl">➕ 交辦新任務</label>' +
      '<section class="hq-config"><h3>🧰 本次製作設定</h3><div class="hq-configgrid">' +
        '<div class="hq-field"><label>使用產品</label><select id="hqProductSelect"></select></div>' +
        '<div class="hq-field"><label>出鏡人物／聲音</label><select id="hqPresenterSelect"></select></div>' +
        '<div class="hq-field"><label>人物名稱</label><input id="hqPresenterName" maxlength="60" placeholder="例：王小明／品牌顧問"></div>' +
        '<div class="hq-field"><label>人物造型與場景</label><input id="hqAppearance" maxlength="500" placeholder="例：專業休閒服、明亮工作室、自然真實"></div>' +
        '<div class="hq-field wide"><label>品牌視覺</label><input id="hqBrandStyle" maxlength="500" placeholder="例：深藍金、可信任、簡潔圖解"></div>' +
        '<div class="hq-field wide"><label>影片行動引導</label><input id="hqCTA" maxlength="500" placeholder="例：留言關鍵字或前往產品頁"></div>' +
        '<div class="hq-field"><label>影片總長（秒，最多 35）</label><input id="hqTotalSeconds" type="number" min="15" max="35" value="30"></div>' +
        '<div class="hq-field"><label>人物出鏡（秒，最多 12）</label><input id="hqPresenterSeconds" type="number" min="0" max="12" value="9"></div>' +
      '</div><div class="hq-configactions"><button class="hq-mini primary" id="hqSaveSetup" type="button">儲存目前設定</button><button class="hq-mini" id="hqManageProducts" type="button">新增／編輯產品</button><button class="hq-mini" id="hqNewPresenter" type="button">新增人物</button><button class="hq-mini hq-danger" id="hqDeletePresenter" type="button">刪除目前人物</button></div><div class="hq-note">影片固定不超過 35 秒；數字人只用在關鍵開場、觀點與收尾，其他段落交給情境畫面與圖解。</div></section>' +
      '<textarea id="hqGoal" placeholder="例：為目前選擇的產品製作 Threads、Facebook 與短影音內容"></textarea>' +
      '<div class="hq-compose"><strong>🗣️ 這次影片要怎麼產生內容？</strong>' +
        '<label class="hq-choice"><input type="radio" name="hqContentMode" value="auto" checked><span>AI 自動構建<small>你給主題，AI 自動安排觀點、腳本與畫面。</small></span></label>' +
        '<label class="hq-choice"><input type="radio" name="hqContentMode" value="statement"><span>以我的陳述為主<small>保留你的看法與語氣，AI 只負責整理、補強與分鏡。</small></span></label>' +
        '<textarea class="hq-statement" id="hqStatement" placeholder="把你真正想說的內容寫在這裡，也可以按『用說的輸入』"></textarea>' +
        '<div class="hq-subtools"><button class="hq-mini" id="hqDictate" type="button">🎙️ 用說的輸入</button><button class="hq-mini" id="hqClearStatement" type="button">清除陳述</button></div>' +
        '<details class="hq-materials"><summary>🖼️ 提供照片或素材</summary><input id="hqMaterialFiles" type="file" accept="image/jpeg,image/png,video/mp4,video/webm,audio/mpeg,audio/wav,audio/webm,application/pdf" multiple>' +
          '<div class="hq-scope"><label><input type="radio" name="hqAssetScope" value="once" checked>只用這一次</label><label><input type="radio" name="hqAssetScope" value="persistent">存入常用素材庫</label></div>' +
          '<div class="hq-note">每個檔案最多 4.5MB；常用素材不會自動套用，請在下方勾選才會使用。</div><div class="hq-assets" id="hqAssetLibrary"></div></details>' +
        '<details class="hq-materials"><summary>🔊 目前人物的專屬聲音</summary><div class="hq-note" id="hqVoiceState">尚未錄製；新影片會先使用 HeyGen 預設聲音。</div>' +
          '<div class="hq-subtools"><button class="hq-mini" id="hqVoiceRecord" type="button">● 開始錄音</button><button class="hq-mini primary" id="hqVoiceCreate" type="button" disabled>建立長期專屬聲音</button><button class="hq-mini" id="hqVoiceRefresh" type="button">查詢聲音進度</button></div><audio class="hq-voiceplayer" id="hqVoicePreview" controls style="display:none"></audio>' +
          '<div class="hq-avatarprivacy">請錄製約 30～60 秒安靜、清楚的本人聲音；建立後只套用在之後的新影片。</div></details>' +
      '</div>' +
      '<div class="hq-channels">' + CHANNELS.map(function (c) { return '<label class="hq-check"><input type="checkbox" data-hq-channel="' + c.id + '"' + (["thread","fb","video"].indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + c.label + '</label>'; }).join("") + '</div>' +
      '<div class="hq-cost" id="hqVideoCost"></div>' +
      '<div class="hq-videoengine"><b>🎬 影片流程：</b>腳本 → 分鏡 → 旁白 → 字幕 → MP4 → 成品驗收 → 批准發布。<br><span id="hqVideoState">' + E(videoStateText()) + '</span><div class="hq-subtools"><button class="hq-mini" id="hqUsageRefresh" type="button">查看費用與產片紀錄</button></div><div class="hq-usage" id="hqUsageBox" style="display:none"></div></div>' +
      '<div class="hq-publish"><strong>🔗 YouTube／TikTok 發布連線</strong>' +
        '<div class="hq-publishrow"><div><div class="hq-publishname">▶ YouTube</div><span class="hq-publishstate" id="hqYoutubeState">' + E(publisherStateText("youtube")) + '</span></div><button class="hq-mini" id="hqYoutubeConnect" type="button">連接 YouTube</button></div>' +
        '<div class="hq-publishrow"><div><div class="hq-publishname">♪ TikTok</div><span class="hq-publishstate" id="hqTiktokState">' + E(publisherStateText("tiktok")) + '</span></div><button class="hq-mini" id="hqTiktokConnect" type="button">連接 TikTok</button></div>' +
        '<div class="hq-publishselects"><label>YouTube 發布可見度<select id="hqYoutubePrivacy"><option value="private">私人</option><option value="unlisted">不公開列出</option><option value="public">公開</option></select></label><label>TikTok 發布可見度<select id="hqTiktokPrivacy" disabled><option value="">授權後選擇</option></select></label></div>' +
        '<div class="hq-publishnote">連接帳號不會發布影片。預設仍需先播放成品並批准；YouTube 新開發者專案與 TikTok 未審核應用可能被平台限制為私人內容。</div></div>' +
      '<div class="hq-avatar"><div class="hq-avatarhead"><img id="hqAvatarPreview" alt="目前人物預覽" style="display:none"><div><b id="hqAvatarTitle">👤 目前人物</b><span id="hqAvatarState">' + E(avatarStateText()) + '</span></div></div>' +
        '<div class="hq-avatarcontrols"><input id="hqAvatarFile" type="file" accept="image/jpeg,image/png"><button class="hq-mini primary" id="hqAvatarCreate" type="button">建立我的人物</button><button class="hq-mini" id="hqAvatarRefresh" type="button">查詢進度</button></div>' +
        '<div class="hq-avatarprivacy">照片只送往你的 HeyGen 帳號建立人物，不寫入公開網站；新影片完成前仍會先給你驗收。</div></div>' +
      '<div class="hq-mode"><b>🚦 批准與發布模式</b>' +
        '<label><input type="radio" name="hqApprovalMode" value="review"' + (approvalMode() === "review" ? " checked" : "") + '><span>先給我看，批准後執行<small>先批准腳本才產生 MP4；影片完成後會再次停在「成品待驗收」，不會自行發布。</small></span></label>' +
        '<label><input type="radio" name="hqApprovalMode" value="auto"' + (approvalMode() === "auto" ? " checked" : "") + '><span>免批准自動執行<small>目前可自動完成品質檢查與 MP4；發布連線完成後才會自動上傳 YouTube／TikTok。</small></span></label>' +
        '<label class="hq-paidtoggle"><input type="checkbox" id="hqAutoPaidVideo"><span>允許排程自動使用付費產片<small>未勾選時，即使選免批准，也會在花費 HeyGen 餘額前停下。</small></span></label>' +
        '<label class="hq-paidtoggle"><input type="checkbox" id="hqAutoPublish"><span>允許免批准模式自動發布<small>只有帳號完成授權、影片完成品質檢查後才會使用；預設保持關閉。</small></span></label>' +
      '</div>' +
      '<div class="hq-note">AI 會依目前主打產品建立快照，先做策略，再分平台產出，最後送你批准。</div>' +
      '<button class="btn" id="hqCreate">建立任務並開始產線 ▶</button><div id="hqCreateMsg"></div>' +
    '</div>' +
    '<div class="panel"><div class="hq-titleline"><label class="lbl">📋 進行中的任務</label><span class="hq-count" id="hqTaskCount">0 件</span></div><div id="hqTasks"></div>' +
      '<details class="hq-archive" id="hqArchive"><summary id="hqArchiveSummary">查看已完成任務</summary><div id="hqDoneTasks"></div></details></div>';
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
    return { queued: 1, strategy: 2, producing: 3, reviewing: 4, revising: 5, approval: 6, video_review: 7, returned: 5, scheduled: 7, done: 7, failed: 3 }[state] || 1;
  }
  var HQ_CREW = [
    { role: "insight", name: "林若曦", title: "洞察官" },
    { role: "strategy", name: "沈墨嫻", title: "策略官" },
    { role: "sales", name: "陳沁柔", title: "內容官" },
    { role: "review", name: "蘇清岩", title: "品質官" },
    { role: "innovate", name: "江星瑤", title: "影音官" }
  ];
  function taskStage(t) {
    var map = {
      queued: { step: 1, who: 0, done: [], work: "林若曦正在讀取任務，整理目標與產品資料", next: "下一位：沈墨嫻規劃內容策略" },
      strategy: { step: 2, who: 1, done: [0], work: "沈墨嫻正在分析受眾，決定市場切角與內容方向", next: "下一位：陳沁柔製作各平台內容" },
      producing: { step: 3, who: 2, done: [0,1], work: "陳沁柔正在撰寫貼文、旁白、字幕與逐鏡分鏡", next: "下一位：蘇清岩進行品質檢查" },
      reviewing: { step: 4, who: 3, done: [0,1,2], work: "蘇清岩正在檢查罐頭句、品牌混用與影音完整度", next: "通過後送你批准；不通過則退回修改" },
      revising: { step: 5, who: 2, done: [0,1], work: "陳沁柔正在依品質意見重新修改內容", next: "下一位：蘇清岩再次審核" },
      returned: { step: 5, who: 2, done: [0,1], work: "陳沁柔等待依你的意見重做內容與影音配置", next: "按『啟動產線』後重新製作" },
      approval: { step: 6, who: 3, done: [0,1,2], work: "蘇清岩已完成腳本審核，目前等待你批准", next: "你批准後，江星瑤開始製作 MP4" },
      scheduled: { step: 6, who: 4, done: [0,1,2,3], work: "江星瑤正在編排鏡頭、相關畫面、旁白與字幕並產生 MP4", next: "影片完成後會停在成品驗收，不會自行發布" },
      video_review: { step: 7, who: 3, done: [0,1,2,4], work: "蘇清岩正在整理影片成品，目前等待你驗收批准", next: "你批准成品後才會進入等待發布" },
      done: { step: 7, who: 4, done: [0,1,2,3,4], work: "五位 AI 員工已完成本次任務", next: "本次產線已結束" },
      failed: { step: 3, who: 2, done: [0,1], work: "陳沁柔遇到問題，正在等待重新啟動", next: "查看錯誤後按『啟動產線』重試" }
    };
    var stage = map[t.state] || map.queued;
    if (t.state === "producing" && t.currentChannel) {
      var channel = CHANNELS.find(function (x) { return x.id === t.currentChannel; });
      stage.work = "陳沁柔正在製作「" + (channel ? channel.label : t.currentChannel) + "」的內容與分鏡";
    }
    if (t.state === "scheduled") {
      var videoChannels = (t.channels || []).filter(function (ch) { return ["video", "tiktok", "youtube"].indexOf(ch) >= 0; });
      var jobs = t.videoJobs || {};
      var finished = videoChannels.length && videoChannels.every(function (ch) { return jobs[ch] && jobs[ch].status === "completed"; });
      var failed = videoChannels.some(function (ch) { return jobs[ch] && jobs[ch].status === "failed"; });
      if (finished) stage = { step: 7, who: 2, done: [0,1,3,4], work: "陳沁柔已整理通過的影片與發布文案，目前等待你發布", next: "尚未執行任何對外發布動作" };
      else if (failed) stage = { step: 6, who: 4, done: [0,1,2,3], work: "江星瑤產生 MP4 時遇到問題，等待重新產片", next: "查看錯誤訊息後再重新執行，不會自動發布" };
      else if (!videoChannels.length) stage = { step: 7, who: 2, done: [0,1,3], work: "陳沁柔已整理完成內容，目前等待你手動發布", next: "尚未執行任何對外發布動作" };
    }
    return stage;
  }
  function taskCrewHtml(t) {
    var stage = taskStage(t);
    var crew = HQ_CREW.map(function (person, index) {
      var cls = index === stage.who ? " active" : (stage.done.indexOf(index) >= 0 ? " done" : "");
      var src = "";
      try { src = typeof fileFor === "function" ? fileFor(person.role) : ""; } catch (_) {}
      return '<div class="hq-person' + cls + '"><div class="hq-personpic">' +
        (src ? '<img src="' + E(src) + '" alt="' + E(person.name) + '" onerror="this.style.display=\'none\'">' : '<span>' + E(["👩‍💼","💁‍♀️","🙋‍♀️","👩‍🎤","👩‍🏫"][index]) + '</span>') +
        '</div><div class="hq-personname">' + E(person.name) + '</div></div>';
    }).join("");
    return '<div class="hq-now"><div class="hq-nowtop"><span class="hq-nowstep">目前第 ' + stage.step + '／7 步</span><span class="hq-state ' + E(t.state) + '">' + E(stateLabel(t.state)) + '</span></div>' +
      '<div class="hq-nowwork">' + E(stage.work) + '</div><div class="hq-next">' + E(stage.next) + '</div><div class="hq-crew">' + crew + '</div>' +
      '<div class="hq-phasebar">' + [1,2,3,4,5,6,7].map(function (i) { return '<i class="' + (i < stage.step ? 'done' : (i === stage.step ? 'active' : '')) + '"></i>'; }).join("") + '</div></div>';
  }
  function outputHtml(t) {
    if (!t.outputs) return "";
    return Object.keys(t.outputs).map(function (ch) {
      var item = CHANNELS.find(function (x) { return x.id === ch; });
      var special = { brief: "上午市場情報", review: "晚上營運覆盤" };
      var isVideo = ["video", "tiktok", "youtube"].indexOf(ch) >= 0;
      var job = t.videoJobs && t.videoJobs[ch];
      var videoBox = "";
      if (job) {
        var statusText = job.status === "completed" ? "✅ MP4 已完成" : job.status === "failed" ? "❌ 影片產生失敗" : "⏳ HeyGen 正在產生 MP4";
        videoBox = '<div class="hq-videobox"><div class="hq-videostatus">' + E(statusText) + (job.progress != null ? "・" + E(job.progress) + "%" : "") + '</div>' +
          (job.failure ? '<div class="hq-error">' + E(job.failure) + '</div>' : '') +
          (job.videoUrl ? '<video controls preload="metadata" poster="' + E(job.thumbnailUrl || "") + '" src="' + E(job.captionedVideoUrl || job.videoUrl) + '"></video><a href="' + E(job.captionedVideoUrl || job.videoUrl) + '" target="_blank" rel="noopener">⬇️ 開啟／下載 MP4</a>' : '') +
          (job.subtitleUrl ? '　<a href="' + E(job.subtitleUrl) + '" target="_blank" rel="noopener">下載字幕</a>' : '') + '</div>';
      }
      return '<details class="hq-output"' + (["approval", "video_review"].indexOf(t.state) >= 0 ? " open" : "") + '><summary>' + E(item ? item.label : (special[ch] || ch)) + '</summary><pre>' + E(t.outputs[ch]) + '</pre>' +
        (isVideo ? '<div class="hq-videoengine"><b>影片製作包：</b>腳本、旁白、字幕、分鏡已完成。<br><b>MP4：</b>' + E(job ? (job.status === "completed" ? "已完成，可預覽或下載。" : "正在 HeyGen 產生中。") : (videoConfigState.ready ? "批准後即可按鈕產生。" : "HeyGen API 尚未啟用。")) + '</div>' + videoBox : '') +
        '<button class="copy" data-hq-copy="' + E(t.id) + '" data-hq-copych="' + E(ch) + '">📋 複製</button></details>';
    }).join("");
  }

  function videoActionButton(t, channel, icon, label) {
    var job = t.videoJobs && t.videoJobs[channel];
    if (job && job.status === "completed" && job.videoUrl)
      return '<a class="hq-mini primary" href="' + E(job.captionedVideoUrl || job.videoUrl) + '" target="_blank" rel="noopener">' + icon + ' 下載 ' + label + ' MP4</a>';
    if (job && ["thinking", "generating", "pending", "processing"].indexOf(job.status) >= 0)
      return '<button class="hq-mini primary" data-hq-videopoll="' + E(t.id) + '" data-hq-videoch="' + E(channel) + '">⏳ 查詢 ' + label + ' 進度</button>';
    return '<button class="hq-mini primary" data-hq-video="' + E(t.id) + '" data-hq-videoch="' + E(channel) + '">' + icon + ' 產生 ' + label + ' MP4</button>';
  }
  function publishActionButton(t, provider) {
    var platform = publishConfigState[provider] || {}, job = t.publishJobs && t.publishJobs[provider], label = publisherLabel(provider), icon = provider === "youtube" ? "▶" : "♪";
    if (job && job.status === "published")
      return (job.url ? '<a class="hq-mini primary" href="' + E(job.url) + '" target="_blank" rel="noopener">✅ 查看 ' + label + '</a>' : '<span class="hq-mini">✅ ' + label + ' 已發布</span>') + '<div class="hq-publishjob">發布完成・' + E(job.privacy || "") + '</div>';
    if (job && ["uploading", "processing"].indexOf(job.status) >= 0)
      return '<button class="hq-mini primary" data-hq-publishpoll="' + E(t.id) + '" data-hq-provider="' + provider + '">⏳ 查詢 ' + label + ' 發布進度</button><div class="hq-publishjob">正在上傳或由平台處理中</div>';
    if (!platform.connected)
      return '<button class="hq-mini" disabled>' + icon + ' 請先連接 ' + label + '</button>';
    return '<button class="hq-mini primary" data-hq-publish="' + E(t.id) + '" data-hq-provider="' + provider + '">' + icon + ' 發布到 ' + label + '</button>' + (job && job.failure ? '<div class="hq-publishjob failed">' + E(job.failure) + '</div>' : '');
  }
  function completedVideoForPublisher(t, provider) {
    var jobs = t.videoJobs || {};
    if (jobs[provider] && jobs[provider].status === "completed" && jobs[provider].videoUrl) return jobs[provider];
    // Older Reels／Shorts tasks produce a normal landscape MP4 under "video".
    // That file is safe to reuse for YouTube after the owner explicitly approves it.
    if (provider === "youtube" && jobs.video && jobs.video.status === "completed" && jobs.video.videoUrl) return jobs.video;
    return null;
  }
  function qualityHtml(t) {
    if (!t.quality) return "";
    var q = t.quality;
    var summary = q.summary;
    if (t.state === "done") summary = "本次內容與發布紀錄已完成。";
    else if (t.state === "video_review") summary = "影片成品已完成，目前等待你播放驗收。";
    else if (t.state === "scheduled") summary = "內容已通過；尚未執行任何對外發布動作。";
    return '<div class="hq-quality"><b>品質主管：</b>' + E(summary) + (q.flags && q.flags.length && ["done", "scheduled"].indexOf(t.state) < 0 ? '<br>需注意：' + E(q.flags.join("、")) : '') + '</div>';
  }
  function buttonsHtml(t) {
    if (t.state === "queued" || t.state === "returned" || t.state === "failed") {
      return '<div class="hq-minirow"><button class="hq-mini primary" data-hq-run="' + E(t.id) + '">啟動產線</button><button class="hq-mini hq-danger" data-hq-del="' + E(t.id) + '">刪除</button></div>';
    }
    if (t.state === "approval") {
      return '<div class="hq-minirow"><button class="hq-mini" data-hq-return="' + E(t.id) + '">退回修改</button><button class="hq-mini primary" data-hq-approve="' + E(t.id) + '">批准並開始產片</button></div>';
    }
    if (t.state === "video_review") {
      var reviewChannels = t.channels || [], reviewButtons = '';
      if (reviewChannels.indexOf("youtube") >= 0) reviewButtons += videoActionButton(t, "youtube", "▶", "YouTube");
      if (reviewChannels.indexOf("tiktok") >= 0) reviewButtons += videoActionButton(t, "tiktok", "♪", "TikTok");
      if (reviewChannels.indexOf("video") >= 0) reviewButtons += videoActionButton(t, "video", "◎", "Reels／Shorts");
      return '<div class="hq-minirow">' + reviewButtons + '<button class="hq-mini" data-hq-return="' + E(t.id) + '">成品退回重做</button><button class="hq-mini primary" data-hq-finalapprove="' + E(t.id) + '">批准成品・等待發布</button></div>';
    }
    if (t.state === "scheduled") {
      var channels = t.channels || [];
      var platformButtons = '';
      if (channels.indexOf("youtube") >= 0) platformButtons += videoActionButton(t, "youtube", "▶", "YouTube");
      if (channels.indexOf("tiktok") >= 0) platformButtons += videoActionButton(t, "tiktok", "♪", "TikTok");
      if (channels.indexOf("video") >= 0) platformButtons += videoActionButton(t, "video", "◎", "Reels／Shorts");
      var publishButtons = '';
      if (t.finalApprovedAt) {
        if (completedVideoForPublisher(t, "youtube")) publishButtons += publishActionButton(t, "youtube");
        if (channels.indexOf("tiktok") >= 0) publishButtons += publishActionButton(t, "tiktok");
      }
      return '<div class="hq-minirow">' + platformButtons + publishButtons + '<button class="hq-mini" data-hq-done="' + E(t.id) + '">手動發布後標記完成</button></div><div class="hq-actionnote">真正發布按鈕只會在成品批准後出現；手動標記不會替你上傳內容。</div>';
    }
    if (t.state === "done" && completedVideoForPublisher(t, "youtube")) {
      if (t.finalApprovedAt)
        return '<div class="hq-minirow">' + publishActionButton(t, "youtube") + '</div><div class="hq-actionnote">此成品已完成，仍可由你決定是否補做 YouTube 發布。</div>';
      return '<div class="hq-minirow"><button class="hq-mini primary" data-hq-recoverpublish="' + E(t.id) + '">我已驗收成品・啟用 YouTube 發布</button></div><div class="hq-actionnote">這只會把既有 MP4 轉為待發布，不會立即上傳。</div>';
    }
    return "";
  }
  function taskHtml(t) {
    var source = t.contentMode === "statement" ? "本人陳述" : "AI 自動構建", materialCount = Array.isArray(t.assets) ? t.assets.length : 0;
    return '<article class="hq-task" id="hq-task-' + E(t.id) + '"><div class="hq-tasktop"><div><h3>' + E(t.goal) + '</h3><div class="hq-meta">📦 ' + E(t.product ? t.product.name : "未設定產品") + '　·　' + E(nowText(t.updatedAt || t.createdAt)) + '</div></div><span class="hq-state ' + E(t.state) + '">' + E(stateLabel(t.state)) + '</span></div>' +
      '<div class="hq-meta">👤 ' + E(t.presenter && t.presenter.name ? t.presenter.name : "預設人物") + '　・　🎙️ ' + E(source) + (materialCount ? '　・　🖼️ ' + materialCount + ' 個指定素材' : '') + '</div><div class="hq-meta">👥 ' + E((t.employees || ["市場策略員", "內容創作員", "品質主管"]).join("・")) + '</div>' + taskCrewHtml(t) +
      (t.error ? '<div class="hq-error">' + E(t.error) + '</div>' : '') + qualityHtml(t) + outputHtml(t) + buttonsHtml(t) + '</article>';
  }

  function activeFocusHtml(t) {
    if (!t) return '<div class="hq-focus"><div class="hq-focusbody"><div class="hq-focuslabel">現在沒有待處理動作</div><div class="hq-focustext">新任務建立後，這裡會直接顯示目前負責人與下一步。</div></div></div>';
    var stage = taskStage(t), person = HQ_CREW[stage.who] || HQ_CREW[0], src = "";
    try { src = typeof fileFor === "function" ? fileFor(person.role) : ""; } catch (_) {}
    var target = (t.state === "approval" || t.state === "video_review") ? "hqApprovals" : "hq-task-" + t.id;
    var button = t.state === "approval" ? "檢查並批准" : (t.state === "video_review" ? "播放並驗收" : "查看進度");
    return '<div class="hq-focus"><div class="hq-focuspic">' + (src ? '<img src="' + E(src) + '" alt="' + E(person.name) + '">' : '👤') + '</div>' +
      '<div class="hq-focusbody"><div class="hq-focuslabel">現在輪到 ' + E(person.name) + '・第 ' + stage.step + '／7 步</div><div class="hq-focustext">' + E(stage.work) + '</div><div class="hq-focusnext">' + E(stage.next) + '</div></div>' +
      '<button class="hq-mini primary" data-hq-focus="' + E(target) + '">' + E(button) + '</button></div>';
  }

  function renderConfigurator() {
    var products = typeof getProds === "function" ? getProds() : [], productSelect = document.getElementById("hqProductSelect");
    if (productSelect) {
      var currentIndex = typeof getCurIdx === "function" ? getCurIdx() : 0;
      productSelect.innerHTML = products.length ? products.map(function (p, i) { return '<option value="' + i + '"' + (i === currentIndex ? ' selected' : '') + '>' + E(p.p_name || "未命名產品") + '</option>'; }).join("") : '<option value="">請先新增產品</option>';
    }
    var people = presenterProfiles(), active = activePresenter(), presenterSelect = document.getElementById("hqPresenterSelect");
    if (presenterSelect) presenterSelect.innerHTML = people.map(function (p) { return '<option value="' + E(p.id) + '"' + (p.id === active.id ? ' selected' : '') + '>' + E(p.name) + '</option>'; }).join("");
    var name = document.getElementById("hqPresenterName"), appearance = document.getElementById("hqAppearance");
    if (name) name.value = active.name || "";
    if (appearance) appearance.value = active.appearancePrompt || "";
    var production = productionProfile(currentProduct()), brand = document.getElementById("hqBrandStyle"), cta = document.getElementById("hqCTA"), total = document.getElementById("hqTotalSeconds"), seconds = document.getElementById("hqPresenterSeconds");
    if (brand) brand.value = production.brandStyle;
    if (cta) cta.value = production.callToAction;
    if (total) total.value = production.totalSeconds;
    if (seconds) seconds.value = production.presenterSeconds;
    var title = document.getElementById("hqAvatarTitle"); if (title) title.textContent = "👤 " + active.name;
  }
  function saveCurrentSetup() {
    var rows = presenterProfiles(), id = activePresenterId(), index = rows.findIndex(function (p) { return p.id === id; });
    if (index >= 0) {
      rows[index] = Object.assign({}, rows[index], {
        name: String(document.getElementById("hqPresenterName").value || "未命名人物").trim().slice(0, 60) || "未命名人物",
        appearancePrompt: String(document.getElementById("hqAppearance").value || "").trim().slice(0, 500)
      });
      try { localStorage.setItem(PRESENTERS_KEY, JSON.stringify(rows)); } catch (_) {}
    }
    saveProductionProfile(); renderConfigurator(); renderAvatarState(); renderVoiceState(); syncConfig();
    var msg = document.getElementById("hqCreateMsg"); if (msg) msg.innerHTML = '<div class="hq-working">✅ 人物與產品製作設定已保存。</div>';
  }
  function addPresenter() {
    var rows = presenterProfiles(); if (rows.length >= 20) { alert("人物最多 20 組。"); return; }
    var id = "person_" + Date.now().toString(36), person = { id: id, name: "新人物 " + (rows.length + 1), appearancePrompt: "保留參考照片本人的臉部與身份特徵，專業、自然、真實比例" };
    rows.push(person);
    try { localStorage.setItem(PRESENTERS_KEY, JSON.stringify(rows)); localStorage.setItem(ACTIVE_PRESENTER_KEY, id); } catch (_) {}
    videoConfigState.avatar = null; videoConfigState.voice = null; videoConfigState.ready = false;
    renderConfigurator(); checkVideoConfig();
  }
  function deletePresenter() {
    var rows = presenterProfiles(), id = activePresenterId();
    if (rows.length <= 1) { alert("至少需要保留一個人物設定。"); return; }
    var person = activePresenter();
    if (!confirm("確定從工具列移除「" + person.name + "」嗎？已完成的舊任務不會被刪除。")) return;
    rows = rows.filter(function (row) { return row.id !== id; });
    try { localStorage.setItem(PRESENTERS_KEY, JSON.stringify(rows)); localStorage.setItem(ACTIVE_PRESENTER_KEY, rows[0].id); } catch (_) {}
    videoConfigState.avatar = null; videoConfigState.voice = null; videoConfigState.ready = false;
    renderConfigurator(); checkVideoConfig();
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

    var approvals = rows.filter(function (x) { return x.state === "approval" || x.state === "video_review"; });
    var activeRows = rows.filter(function (x) { return ["approval", "video_review", "done"].indexOf(x.state) < 0; });
    var doneRows = rows.filter(function (x) { return x.state === "done"; });
    var attention = approvals[0] || activeRows[0] || null;
    var focus = document.getElementById("hqActiveNow");
    if (focus) focus.innerHTML = activeFocusHtml(attention);
    var ac = document.getElementById("hqApprovalCount"), ah = document.getElementById("hqApprovals");
    if (ac) ac.textContent = approvals.length + " 件";
    if (ah) ah.innerHTML = approvals.length ? approvals.map(taskHtml).join("") : '<div class="hq-empty">目前沒有等待批准的內容。</div>';
    var tc = document.getElementById("hqTaskCount"), th = document.getElementById("hqTasks");
    if (tc) tc.textContent = activeRows.length + " 件";
    if (th) th.innerHTML = activeRows.length ? activeRows.map(taskHtml).join("") : '<div class="hq-empty">目前沒有進行中的任務。</div>';
    var ds = document.getElementById("hqArchiveSummary"), dh = document.getElementById("hqDoneTasks"), archive = document.getElementById("hqArchive");
    if (ds) ds.textContent = "查看已完成任務（" + doneRows.length + " 件）";
    if (dh) dh.innerHTML = doneRows.length ? doneRows.map(taskHtml).join("") : '<div class="hq-empty">目前還沒有完成紀錄。</div>';
    if (archive) archive.style.display = doneRows.length ? "block" : "none";
  }

  function selectedVideoChannels(task) {
    var channels = task ? (task.channels || []) : Array.from(document.querySelectorAll("[data-hq-channel]:checked")).map(function (x) { return x.dataset.hqChannel; });
    return channels.filter(function (ch) { return ["video", "tiktok", "youtube"].indexOf(ch) >= 0; });
  }
  function renderVideoCost() {
    var box = document.getElementById("hqVideoCost"); if (!box) return;
    var count = selectedVideoChannels().length;
    box.innerHTML = count ? '<strong>目前會建立 ' + count + ' 支付費 MP4</strong><br>每個影片平台都會各送出 1 次 HeyGen 產片；只想測試一支時，請只勾 Reels／Shorts。' : '<strong>目前不會使用 HeyGen 影片餘額</strong><br>只會產生文字、腳本與分鏡。';
  }
  async function loadVideoUsage() {
    var box = document.getElementById("hqUsageBox"); if (!box) return;
    box.style.display = "block"; box.textContent = "正在讀取 HeyGen 產片紀錄…";
    try {
      var data = await videoAPI("/video-usage", { workspaceId: workspaceId() }), sessions = Array.isArray(data.sessions) ? data.sessions : [];
      var balance = data.billing && data.billing.remaining != null ? "目前餘額：" + data.billing.remaining + " " + (data.billing.currency || "USD") + "。" : "";
      box.innerHTML = '<b>' + E(balance + " 最近共有 " + sessions.length + " 個 Video Agent 工作。") + '</b>' + (sessions.length ? '<br>' + sessions.slice(0, 12).map(function (s, i) { return (i + 1) + '. ' + E(s.title || "未命名影片") + '・' + E(nowText((s.createdAt || 0) * 1000)); }).join('<br>') : '<br>目前沒有讀到產片工作。') + '<br>HeyGen API 未提供每支影片的實際扣款欄位，金額以 HeyGen 帳務頁為準。';
    } catch (err) { box.textContent = "讀取失敗：" + String(err && err.message ? err.message : err); }
  }

  function localQuality(task) {
    var all = Object.keys(task.outputs || {}).map(function (k) { return task.outputs[k]; }).join("\n");
    var flags = [];
    var cliches = ["相信自己", "勇敢前進", "保持正向", "充滿挑戰", "無限可能"];
    if (all.length < 180) flags.push("內容可能太短");
    if (!/[0-9０-９]|今天|最近|這週|第一步|先/.test(all)) flags.push("缺少具體時間或下一步");
    cliches.forEach(function (x) { if (all.indexOf(x) >= 0) flags.push("出現空泛句：" + x); });
    var otherBrands = (typeof getProds === "function" ? getProds() : []).map(function (p) { return p.p_name || ""; }).filter(function (x) { return x && (!task.product || x !== task.product.name); });
    otherBrands.forEach(function (x) { if (all.indexOf(x) >= 0) flags.push("疑似混入其他品牌：" + x); });
    Object.keys(task.outputs || {}).filter(function (ch) { return ["video", "tiktok", "youtube"].indexOf(ch) >= 0; }).forEach(function (ch) {
      var script = String(task.outputs[ch] || ""), timecodes = (script.match(/(?:^|\n|\s)(?:[0-2]?\d|3[0-5])\s*(?:秒|s|｜|\||-|～|—|:|：)/g) || []).length,
        visualCues = (script.match(/畫面|鏡頭|情境|素材|圖解|字卡|對照|時間軸/g) || []).length;
      if (timecodes < 6) flags.push("影片缺少至少 6 段、35 秒內的時間碼分鏡");
      if (visualCues < 6) flags.push("影片缺少足夠的情境畫面與圖解安排");
    });
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
      var presenterName = t.presenter && t.presenter.name ? t.presenter.name : "創作者";
      var sourceBrief = t.contentMode === "statement" && t.statement
        ? t.goal + "\n\n【" + presenterName + "親自陳述，必須保留核心立場與口吻】\n" + t.statement
        : t.goal + "\n\n【內容來源】由 AI 自動構建，但必須具體、有觀點，不能寫成罐頭。";
      var plan = await callAPI("/content", {
        task: sourceBrief,
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
        updateTask(id, { state: "producing", currentChannel: ch }); render();
        var videoBrief = ["video", "tiktok", "youtube"].indexOf(ch) >= 0
          ? "\n\n【本次影片設定】總長嚴禁超過 35 秒，本支為 " + Math.min(35, t.production && t.production.totalSeconds || 30) + " 秒；人物出鏡合計約 " + Math.min(12, t.production && t.production.presenterSeconds || 9) + " 秒；品牌視覺：" + (t.production && t.production.brandStyle || "依產品定位") + "；行動引導：" + (t.production && t.production.callToAction || "提供自然的下一步") + "。\n【固定七段分鏡】0–3 秒：問題鉤子大字卡；3–8 秒：人物提出具體觀點；8–14 秒：問題情境或產品素材；14–20 秒：時間軸、步驟或前後對照圖解；20–26 秒：第二個具體情境／證據；26–31 秒：人物給結論；31–35 秒：一句行動引導。\n【影音分鏡硬規則】每段都要交付時間碼、旁白、字幕與畫面說明。人物單一鏡位不得連續超過 6 秒；不能整支人物站著念稿。"
          : "";
        var result = await callAPI("/execute", {
          task: sourceBrief + "\n\n【內容策略】\n" + strategy + "\n\n【品質要求】具體、台灣口語、避免罐頭、提供可執行下一步。" + videoBrief,
          profile: typeof getProfile === "function" ? getProfile() : null,
          reports: [], channel: ch, hqTaskId: id, productSnapshot: t.product
        });
        outputs[ch] = result.output || result.content || JSON.stringify(result);
        updateTask(id, { outputs: outputs }); render();
      }
      updateTask(id, { state: "reviewing", currentChannel: "", outputs: outputs }); render();
      var latest = findTask(id);
      var quality = await aiReview(latest, outputs);

      if (!quality.pass) {
        updateTask(id, { state: "revising", quality: quality }); render();
        var revised = {};
        for (var j = 0; j < t.channels.length; j++) {
          var reviseChannel = t.channels[j];
          var oldOutput = outputs[reviseChannel] || "";
          var revisedResult = await callAPI("/execute", {
            task: sourceBrief + "\n\n【原稿】\n" + oldOutput + "\n\n【品質主管問題】\n" + (quality.flags || []).join("\n") + "\n\n【指定修法】\n" + (quality.fix || "改得更具體、更像真人，保留正確資訊。") + "\n\n請直接交付修改後成品，不要解釋修改過程；不得改變創作者原始陳述的核心立場。",
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

      var nextState = t.approvalMode === "auto" && t.autoVideoEnabled === true ? "scheduled" : "approval";
      updateTask(id, { state: nextState, outputs: outputs, quality: quality });
      if (nextState === "scheduled") startApprovedVideos(id, true);
    } catch (err) {
      updateTask(id, { state: "failed", error: String(err && err.message ? err.message : err) });
    } finally {
      currentRunId = null; render();
    }
  }

  async function uploadTaskAssets() {
    var selected = Array.from(document.querySelectorAll("[data-hq-asset]:checked")).map(function (input) {
      return assetLibrary.find(function (asset) { return asset.id === input.dataset.hqAsset; });
    }).filter(Boolean);
    var input = document.getElementById("hqMaterialFiles"), files = Array.from((input && input.files) || []);
    if (files.length > 6) throw new Error("一次最多上傳 6 個新素材。");
    var scopeInput = document.querySelector('input[name="hqAssetScope"]:checked'), scope = scopeInput ? scopeInput.value : "once";
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.size > 4500000) throw new Error("素材「" + file.name + "」超過 4.5MB。");
      var payload;
      if (/^image\/(jpeg|png)$/.test(file.type)) {
        var prepared = await prepareAvatarImage(file);
        payload = { data: prepared.image, mediaType: prepared.mediaType, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
      } else payload = await blobPayload(file, file.name);
      var data = await videoAPI("/media-assets", { action: "upload", workspaceId: workspaceId(), productKey: productKey(currentProduct()), scope: scope, name: payload.name || file.name, mediaType: payload.mediaType, data: payload.data });
      selected.push(data.asset);
      if (scope === "persistent") assetLibrary.unshift(data.asset);
    }
    if (input) input.value = "";
    renderAssetLibrary();
    var seen = {};
    return selected.filter(function (asset) { if (!asset || !asset.id || seen[asset.id]) return false; seen[asset.id] = true; return true; }).slice(0, 20);
  }
  function cleanupOnceAssets(task) {
    (task && Array.isArray(task.assets) ? task.assets : []).filter(function (asset) { return asset && asset.scope === "once" && asset.id; }).forEach(function (asset) {
      videoAPI("/media-assets", { action: "delete", workspaceId: workspaceId(), assetId: asset.id }).catch(function () {});
    });
  }

  async function createTask() {
    var goal = String(document.getElementById("hqGoal").value || "").trim();
    var msg = document.getElementById("hqCreateMsg");
    if (!goal) { msg.innerHTML = '<div class="hq-error">請先寫下這次要完成的目標。</div>'; return; }
    var product = productSnapshot();
    if (!product) { msg.innerHTML = '<div class="hq-error">請先到「我的產品」新增並選定目前主打產品。</div>'; return; }
    var channels = Array.from(document.querySelectorAll("[data-hq-channel]:checked")).map(function (x) { return x.dataset.hqChannel; });
    if (!channels.length) { msg.innerHTML = '<div class="hq-error">至少選擇一種產出形式。</div>'; return; }
    var modeInput = document.querySelector('input[name="hqContentMode"]:checked'), contentMode = modeInput ? modeInput.value : "auto";
    var statement = String(document.getElementById("hqStatement").value || "").trim();
    if (contentMode === "statement" && !statement) { msg.innerHTML = '<div class="hq-error">你選了「以我的陳述為主」，請先輸入或說出想表達的內容。</div>'; return; }
    var createButton = document.getElementById("hqCreate"); createButton.disabled = true; createButton.textContent = "素材整理與任務建立中…";
    var assets;
    try { assets = await uploadTaskAssets(); }
    catch (err) { msg.innerHTML = '<div class="hq-error">' + E(err && err.message ? err.message : err) + '</div>'; createButton.disabled = false; createButton.textContent = "建立任務並開始產線 ▶"; return; }
    var employees = ["市場策略員", "內容創作員", "品質主管"];
    if (channels.indexOf("video") >= 0) employees.splice(2, 0, "短影音編導");
    if (channels.indexOf("tiktok") >= 0) employees.splice(employees.length - 1, 0, "TikTok 編導");
    if (channels.indexOf("youtube") >= 0) employees.splice(employees.length - 1, 0, "YouTube 製作人");
    var autoVideoEnabled = approvalMode() === "auto" && !!document.getElementById("hqAutoPaidVideo").checked;
    saveCurrentSetup();
    var t = { id: uid(), goal: goal, contentMode: contentMode, statement: statement.slice(0, 6000), assets: assets, product: product, presenter: activePresenter(), production: currentProductionProfile(), channels: channels, employees: employees, approvalMode: approvalMode(), autoVideoEnabled: autoVideoEnabled, state: "queued", createdAt: Date.now(), updatedAt: Date.now(), outputs: {} };
    var rows = read(); rows.unshift(t); write(rows);
    remoteUpsert(t); syncConfig(channels);
    document.getElementById("hqGoal").value = "";
    document.getElementById("hqStatement").value = "";
    msg.innerHTML = '<div class="hq-working">✅ 任務已建立，AI 團隊開始接力。</div>';
    createButton.disabled = false; createButton.textContent = "建立任務並開始產線 ▶";
    render(); runPipeline(t.id);
  }

  function mergeVideoJob(taskId, channel, job, syncRemote) {
    var task = findTask(taskId); if (!task) return;
    var jobs = Object.assign({}, task.videoJobs || {}); jobs[channel] = job;
    var patch = { videoJobs: jobs };
    var expectedVideos = (task.channels || []).filter(function (ch) { return ["video", "tiktok", "youtube"].indexOf(ch) >= 0; });
    var allVideosReady = expectedVideos.length && expectedVideos.every(function (ch) { return jobs[ch] && jobs[ch].status === "completed"; });
    if (allVideosReady && task.approvalMode !== "auto") patch.state = "video_review";
    if (syncRemote === false) {
      var rows = read(), index = rows.findIndex(function (x) { return x.id === taskId; });
      if (index >= 0) { rows[index] = Object.assign({}, rows[index], patch, { updatedAt: Date.now() }); write(rows); }
    } else updateTask(taskId, patch);
    render();
  }
  function scheduleAvatarPoll() {
    if (avatarPoller) clearTimeout(avatarPoller);
    avatarPoller = setTimeout(function () { pollAvatar(true); }, 15000);
  }
  async function pollAvatar(quiet) {
    try {
      var data = await videoAPI("/avatar-status", { workspaceId: workspaceId(), profileId: activePresenterId() });
      videoConfigState.avatar = data.avatar;
      videoConfigState.avatarReady = data.avatar && data.avatar.status === "ready";
      videoConfigState.ready = !!(videoConfigState.apiValid && videoConfigState.ownerReady && videoConfigState.creditReady && videoConfigState.avatarReady);
      renderAvatarState();
      var el = document.getElementById("hqVideoState"); if (el) el.textContent = videoStateText();
      if (data.avatar && ["building_face", "building_style"].indexOf(data.avatar.status) >= 0) scheduleAvatarPoll();
    } catch (err) {
      if (!quiet) alert(String(err && err.message ? err.message : err));
    }
  }
  function prepareAvatarImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL("image/jpeg", .9);
          resolve({ mediaType: "image/jpeg", image: dataUrl.split(",")[1] || "" });
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }
  async function createAvatar() {
    var input = document.getElementById("hqAvatarFile"), file = input && input.files && input.files[0];
    if (!file) { alert("請先選擇你的正面照片。"); return; }
    if (["image/jpeg", "image/png"].indexOf(file.type) < 0 || file.size > 4500000) {
      alert("請使用 4.5MB 以下的 JPEG 或 PNG 照片。"); return;
    }
    var button = document.getElementById("hqAvatarCreate");
    button.disabled = true; button.textContent = "人物建立中…";
    try {
      saveCurrentSetup();
      var payload = await prepareAvatarImage(file);
      var presenter = activePresenter();
      var data = await videoAPI("/avatar-create", { workspaceId: workspaceId(), profileId: presenter.id, profileName: presenter.name, appearancePrompt: presenter.appearancePrompt, mediaType: payload.mediaType, image: payload.image });
      videoConfigState.avatar = data.avatar; videoConfigState.avatarReady = false; videoConfigState.ready = false;
      renderAvatarState();
      var el = document.getElementById("hqVideoState"); if (el) el.textContent = videoStateText();
      scheduleAvatarPoll();
    } catch (err) {
      alert(String(err && err.message ? err.message : err));
    } finally {
      button.disabled = false; button.textContent = "建立我的人物";
    }
  }
  function scheduleVideoPoll(taskId, channel) {
    var key = taskId + ":" + channel;
    if (videoPollers[key]) clearTimeout(videoPollers[key]);
    videoPollers[key] = setTimeout(function () {
      pollVideo(taskId, channel, true);
    }, 15000);
  }
  async function startVideo(taskId, channel, quiet) {
    var task = findTask(taskId); if (!task) return;
    var taskConfig;
    try { taskConfig = await videoAPI("/video-config", { workspaceId: workspaceId(), profileId: task.presenter && task.presenter.id || "default" }); }
    catch (err) { if (!quiet) alert(String(err && err.message ? err.message : err)); return; }
    if (!taskConfig.ready) {
      if (!quiet) alert("「" + (task.presenter && task.presenter.name || "目前人物") + "」尚未完成頭像／API 設定。目前保留腳本與分鏡，不會扣影片點數。");
      return;
    }
    mergeVideoJob(taskId, channel, { channel: channel, status: "thinking", updatedAt: Date.now() }, false);
    try {
      var data = await videoAPI("/video-create", {
        workspaceId: workspaceId(), taskId: taskId, channel: channel
      });
      mergeVideoJob(taskId, channel, data.job);
      if (data.job.status !== "completed") scheduleVideoPoll(taskId, channel);
    } catch (err) {
      mergeVideoJob(taskId, channel, { channel: channel, status: "failed", failure: String(err && err.message ? err.message : err), updatedAt: Date.now() });
    }
  }
  async function startApprovedVideos(taskId, quiet) {
    var task = findTask(taskId); if (!task) return;
    var channels = (task.channels || []).filter(function (ch) { return ["video", "tiktok", "youtube"].indexOf(ch) >= 0; });
    for (var i = 0; i < channels.length; i++) {
      var current = findTask(taskId), job = current && current.videoJobs && current.videoJobs[channels[i]];
      if (!job || job.status === "failed") await startVideo(taskId, channels[i], quiet);
    }
  }
  async function pollVideo(taskId, channel, quiet) {
    var task = findTask(taskId), job = task && task.videoJobs && task.videoJobs[channel];
    if (!job || !job.sessionId) return;
    try {
      var data = await videoAPI("/video-status", {
        workspaceId: workspaceId(), taskId: taskId, channel: channel
      });
      mergeVideoJob(taskId, channel, data.job);
      if (["thinking", "generating", "pending", "processing"].indexOf(data.job.status) >= 0)
        scheduleVideoPoll(taskId, channel);
    } catch (err) {
      if (!quiet) alert(String(err && err.message ? err.message : err));
      else scheduleVideoPoll(taskId, channel);
    }
  }
  function resumeVideoPolling() {
    read().forEach(function (task) {
      Object.keys(task.videoJobs || {}).forEach(function (channel) {
        var job = task.videoJobs[channel];
        if (job && job.sessionId && ["thinking", "generating", "pending", "processing"].indexOf(job.status) >= 0)
          scheduleVideoPoll(task.id, channel);
      });
      if (task.state === "scheduled" && task.approvalMode === "auto")
        startApprovedVideos(task.id, true);
    });
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
    document.getElementById("hqSaveSetup").addEventListener("click", saveCurrentSetup);
    document.getElementById("hqNewPresenter").addEventListener("click", addPresenter);
    document.getElementById("hqDeletePresenter").addEventListener("click", deletePresenter);
    document.getElementById("hqManageProducts").addEventListener("click", function () { if (typeof switchTo === "function") switchTo("profile"); });
    document.getElementById("hqProductSelect").addEventListener("change", function () {
      var index = Number(this.value); if (typeof pickProduct === "function" && Number.isFinite(index)) pickProduct(index);
      renderConfigurator(); render(); syncConfig();
    });
    document.getElementById("hqPresenterSelect").addEventListener("change", function () {
      try { localStorage.setItem(ACTIVE_PRESENTER_KEY, this.value); } catch (_) {}
      videoConfigState.avatar = null; videoConfigState.voice = null; videoConfigState.ready = false;
      renderConfigurator(); renderAvatarState(); renderVoiceState(); checkVideoConfig();
    });
    document.getElementById("hqAvatarCreate").addEventListener("click", createAvatar);
    document.getElementById("hqAvatarRefresh").addEventListener("click", function () { pollAvatar(false); });
    document.getElementById("hqDictate").addEventListener("click", function () { startDictation(this); });
    document.getElementById("hqClearStatement").addEventListener("click", function () { document.getElementById("hqStatement").value = ""; });
    document.getElementById("hqStatement").addEventListener("input", function () {
      if (this.value.trim()) {
        var own = document.querySelector('input[name="hqContentMode"][value="statement"]'); if (own) own.checked = true;
      }
    });
    document.getElementById("hqVoiceRecord").addEventListener("click", function () { toggleVoiceRecording(this); });
    document.getElementById("hqVoiceCreate").addEventListener("click", createVoice);
    document.getElementById("hqVoiceRefresh").addEventListener("click", function () { pollVoice(false); });
    document.getElementById("hqUsageRefresh").addEventListener("click", loadVideoUsage);
    document.getElementById("hqYoutubeConnect").addEventListener("click", function () { connectPublisher("youtube"); });
    document.getElementById("hqTiktokConnect").addEventListener("click", function () { connectPublisher("tiktok"); });
    document.getElementById("hqYoutubePrivacy").addEventListener("change", function () { syncConfig(); });
    document.getElementById("hqTiktokPrivacy").addEventListener("change", function () { syncConfig(); });
    document.querySelectorAll("[data-hq-channel]").forEach(function (input) { input.addEventListener("change", renderVideoCost); });
    document.getElementById("hqAutoPaidVideo").addEventListener("change", function () { syncConfig(); });
    document.getElementById("hqAutoPublish").addEventListener("change", function () { syncConfig(); });
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
    document.querySelectorAll('input[name="hqApprovalMode"]').forEach(function (input) {
      input.addEventListener("change", function () {
        saveApprovalMode(input.value);
        syncConfig();
      });
    });
    document.getElementById("p_hq").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.hqFocus) {
        var target = document.getElementById(b.dataset.hqFocus);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (b.dataset.hqRun) runPipeline(b.dataset.hqRun);
      if (b.dataset.hqApprove) {
        var approvedTask = findTask(b.dataset.hqApprove), paidCount = selectedVideoChannels(approvedTask).length;
        if (paidCount && !confirm("這次會送出 " + paidCount + " 個 HeyGen 付費產片工作。確定開始嗎？")) return;
        updateTask(b.dataset.hqApprove, { state: "scheduled", approvedAt: Date.now() }); render(); startApprovedVideos(b.dataset.hqApprove, false);
      }
      if (b.dataset.hqFinalapprove) { updateTask(b.dataset.hqFinalapprove, { state: "scheduled", finalApprovedAt: Date.now() }); render(); }
      if (b.dataset.hqRecoverpublish) {
        if (!confirm("確定這支既有 MP4 已驗收，可以開啟 YouTube 發布嗎？\n這一步不會上傳影片。")) return;
        updateTask(b.dataset.hqRecoverpublish, { state: "scheduled", finalApprovedAt: Date.now(), recoveredForPublishingAt: Date.now() }); render();
      }
      if (b.dataset.hqReturn) { updateTask(b.dataset.hqReturn, { state: "returned", returnNote: "請加強相關情境畫面、鏡頭變化與真人口吻。", videoJobs: {} }); render(); }
      if (b.dataset.hqDone) { var completed = findTask(b.dataset.hqDone); updateTask(b.dataset.hqDone, { state: "done", publishedAt: Date.now() }); cleanupOnceAssets(completed); render(); }
      if (b.dataset.hqVideo) startVideo(b.dataset.hqVideo, b.dataset.hqVideoch);
      if (b.dataset.hqVideopoll) pollVideo(b.dataset.hqVideopoll, b.dataset.hqVideoch, false);
      if (b.dataset.hqPublish) publishTaskVideo(b.dataset.hqPublish, b.dataset.hqProvider);
      if (b.dataset.hqPublishpoll) pollPublish(b.dataset.hqPublishpoll, b.dataset.hqProvider);
      if (b.dataset.hqDel) {
        var removed = findTask(b.dataset.hqDel); cleanupOnceAssets(removed);
        var rows = read().filter(function (x) { return x.id !== b.dataset.hqDel; }); write(rows); remoteDelete(b.dataset.hqDel); render();
      }
      if (b.dataset.hqCopy) copyOutput(b.dataset.hqCopy, b.dataset.hqCopych, b);
    });
  }

  function hookSwitch() {
    var old = window.switchTo;
    window.switchTo = function (p) {
      var result = old ? old.apply(this, arguments) : null;
      var lineup = document.getElementById("lineup");
      if (lineup) lineup.classList.toggle("hq-hidden", p === "hq");
      if (p === "hq") { render(); remoteHydrate(false); syncConfig(); }
      return result;
    };
  }

  function init() {
    addStyles(); injectPage(); bind(); hookSwitch(); renderConfigurator(); render();
    remoteHydrate(false).then(function () { syncConfig(); resumeVideoPolling(); });
    loadAssetLibrary(); renderVideoCost();
    checkVideoConfig();
    checkPublishConfig(new URLSearchParams(location.search).has("oauth"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
