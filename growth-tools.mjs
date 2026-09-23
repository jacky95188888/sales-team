// Adapted concepts from mars-tw/open-seo-advisor-skill (Apache-2.0).
// New browser implementation: organic channels, inert HTML inspection,
// no fabricated analytics, no automatic provider calls. See docs/open-seo-integration.md.
export function buildLinks(raw, campaign, content) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('請填入不含帳密的 http 或 https 網址。');
  for (const [name, value] of [['活動代號', campaign], ['素材代號', content]]) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) throw new Error(name + '請用小寫英文、數字、底線或連字號，最多 80 字。');
  }
  return ['threads', 'facebook', 'line', 'youtube', 'tiktok'].map(source => {
    const tagged = new URL(url);
    for (const key of [...tagged.searchParams.keys()]) if (/^utm_/i.test(key)) tagged.searchParams.delete(key);
    for (const [key, value] of Object.entries({source, medium: source === 'youtube' || source === 'tiktok' ? 'video' : 'social', campaign, content})) tagged.searchParams.set('utm_' + key, value);
    return {source, url: tagged.href};
  });
}

export function inspectHtml(html, doc = document) {
  if (!html.trim()) throw new Error('請先選擇 HTML 檔案。');
  if (html.length > 2_000_000) throw new Error('HTML 請限制在 2 MB 以內。');
  // A template remains inert: scripts, images and frames are not mounted or fetched.
  const template = doc.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  const all = selector => [...root.querySelectorAll(selector)];
  const rows = [];
  const add = (priority, label, evidence, action) => rows.push({priority, label, evidence, action});
  const title = root.querySelector('title')?.textContent.trim();
  if (!title) add('P1', '補上搜尋標題', 'HTML 未找到有文字的 title。', '用一句話說清楚這頁提供什麼。');
  const description = all('meta[name]').find(n => n.getAttribute('name').toLowerCase() === 'description')?.getAttribute('content')?.trim();
  if (!description) add('P2', '補上頁面摘要', 'HTML 未找到有內容的 meta description。', '描述適用對象、用途與下一步，避免保證排名。');
  const h1 = all('h1');
  if (!h1.some(n => n.textContent.trim())) add('P1', '主標題需要說明用途', '未找到有文字的 H1。', '先說明服務對象與要解決的問題。');
  else if (h1.length > 1) add('P3', '人工確認標題層級', `找到 ${h1.length} 個 H1。`, '檢查閱讀順序；多個 H1 本身不代表排名錯誤。');
  const imgs = all('img:not([alt])');
  if (imgs.length) add('P2', '檢查圖片替代文字', `${imgs.length} 張圖片沒有 alt 屬性。`, '資訊圖片寫出意義；純裝飾圖片可設空 alt。');
  const actions = all('a,button').filter(n => /開始|試用|聯絡|預約|下載|加入|購買|送出|索取|報名/.test(n.textContent));
  if (!actions.length) add('待人工確認', '確認下一步行動', '靜態 HTML 未匹配到常見行動文字。', '檢查訪客是否知道下一步；這不代表實際頁面沒有按鈕。');
  const canon = all('link[rel]').find(n => n.getAttribute('rel').toLowerCase().split(/\s+/).includes('canonical'))?.getAttribute('href');
  if (!canon) add('P2', '確認標準網址', '靜態 HTML 未找到 canonical 網址。', '依頁面實際正式網址設定，勿把所有子頁都指向首頁。');
  const robots = all('meta[name]').filter(n => /^(robots|googlebot)$/i.test(n.getAttribute('name')));
  if (robots.some(n => /\bnoindex\b/i.test(n.getAttribute('content') || ''))) add('待人工確認', '頁面要求不被收錄', '找到 noindex。', '測試頁可保留；若是要公開搜尋的頁面，確認是否誤設。');
  return {scope:'只檢查提供的靜態 HTML；未查 robots.txt、sitemap、HTTP 標頭、動態畫面、排名、載入速度或流量。', findings:rows};
}

export const checklist = [
  '明確寫出要幫助哪一種人、解決哪一個問題。',
  '開頭的承諾，在內文有具體例子或可查證依據。',
  '引用資料保留來源與日期，親身實測與推測分開。',
  '只安排一個主要行動，並確認目的頁承諾一致。',
  '案例與圖片具有使用權，沒有虛構見證或保證效果。',
  '本次只改一項變因，事先決定觀察指標；資料不足不判定勝負。'
];
