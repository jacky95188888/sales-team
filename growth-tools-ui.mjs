import {buildLinks, inspectHtml, checklist} from './growth-tools.mjs';
const el = id => document.getElementById(id);
let audit = null;
let links = [];
function error(node, e) { node.classList.add('error'); node.textContent = e.message; }
el('utm-form').addEventListener('submit', event => {
  event.preventDefault();
  const out = el('utm-result'); out.replaceChildren(); out.classList.remove('error'); links = [];
  try {
    links = buildLinks(el('url').value.trim(), el('campaign').value.trim(), el('creative').value.trim());
    for (const link of links) {
      const row = document.createElement('div'); row.className = 'linkrow';
      const name = document.createElement('strong'); name.textContent = link.source;
      const text = document.createElement('textarea'); text.readOnly = true; text.value = link.url; text.setAttribute('aria-label', link.source + ' 宣傳連結');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '複製連結';
      button.onclick = async () => { try { await navigator.clipboard.writeText(link.url); button.textContent = '已複製'; } catch { text.focus(); text.select(); button.textContent = '請長按文字複製'; } };
      row.append(name, text, button); out.append(row);
    }
  } catch(e) { error(out, e); }
});
for (const id of ['url', 'campaign', 'creative']) el(id).addEventListener('input', () => { links = []; el('utm-result').textContent = '設定已變更，請重新產生連結。'; });
el('html-file').addEventListener('change', () => { audit = null; el('audit-result').textContent = '已更換檔案，請重新檢查。'; });
el('audit').onclick = async () => {
  const out = el('audit-result'); out.classList.remove('error'); audit = null;
  const file = el('html-file').files[0];
  try {
    if (!file) throw new Error('請先選擇 HTML 檔案。');
    if (file.size > 2_000_000) throw new Error('HTML 請限制在 2 MB 以內。');
    const html = await file.text();
    if (el('html-file').files[0] !== file) throw new Error('檔案已變更，請重新檢查。');
    audit = {...inspectHtml(html), filename:file.name};
    out.textContent = audit.scope + '\n\n' + (audit.findings.map(f => `[${f.priority}] ${f.label}\n依據：${f.evidence}\n建議：${f.action}`).join('\n\n') || '這組靜態檢查未發現缺漏；不代表 SEO、速度或內容品質已通過。');
  } catch(e) { error(out, e); }
};
checklist.forEach((text, i) => {
  const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.id = 'check-' + i;
  input.onchange = () => { const n = el('checklist').querySelectorAll(':checked').length; el('check-status').textContent = `已確認 ${n} / 6；${n === 6 ? '人工清單完成，不代表系統批准發布。' : '尚待審核。'}`; };
  label.append(input, document.createTextNode(text)); el('checklist').append(label);
});
el('export').onclick = () => {
  const record = {version:1, reviewedAt:new Date().toISOString(), status:'draft', dataSource:'browser-local-user-input', links, htmlAudit:audit, manualChecks:checklist.map((text,i) => ({text,confirmed:el('check-'+i).checked})), analyticsConnected:false, publishingApproved:false};
  const url = URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'sanbao-growth-review.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
