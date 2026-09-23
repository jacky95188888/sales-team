const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer(async (req,res) => {
    try {
      const name = new URL(req.url, 'http://localhost').pathname;
      if (!/^\/(growth-tools\.html|growth-tools(?:-ui)?\.mjs)$/.test(name)) {res.writeHead(404).end();return;}
      res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : 'text/html');
      res.end(await fs.readFile(path.join(root,name)));
    } catch {res.writeHead(500).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const external = [], errors = [];
    page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/growth-tools.html`);
    await page.locator('#check-5').waitFor();
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.fill('#url','https://example.com/?x=1&x=2#faq');
    await page.fill('#campaign','test_campaign');
    await page.click('#utm-form button');
    assert.equal(await page.locator('#utm-result textarea').count(),5);
    const hostile = '<title>Test</title><script>window.PWNED=1</script><img src="https://example.invalid/track"><iframe src="https://example.invalid/frame"></iframe><h1>Test</h1>';
    await page.setInputFiles('#html-file',{name:'sample.html',mimeType:'text/html',buffer:Buffer.from(hostile)});
    await page.click('#audit');
    await page.waitForFunction(()=>document.getElementById('audit-result').textContent.includes('canonical'));
    assert.equal(await page.evaluate(()=>window.PWNED),undefined);
    assert.match(await page.locator('#audit-result').innerText(),/沒有 alt/);
    for(let i=0;i<6;i++)await page.check('#check-'+i);
    const downloadPromise=page.waitForEvent('download'); await page.click('#export');
    const download=await downloadPromise; const record=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(record.status,'draft'); assert.equal(record.publishingApproved,false); assert.equal(record.manualChecks.filter(x=>x.confirmed).length,6);
    assert.equal(record.htmlAudit.filename,'sample.html');
    await page.fill('#campaign','updated');
    assert.equal(await page.locator('#utm-result textarea').count(),0);
    await page.setInputFiles('#html-file',{name:'new.html',mimeType:'text/html',buffer:Buffer.from('<title>New</title>')});
    assert.match(await page.locator('#audit-result').innerText(),/重新檢查/);
    assert.deepEqual(external,[]); assert.deepEqual(errors,[]);
    console.log('Browser checks passed: mobile/desktop, UTM, inert HTML, export, invalidation, no external requests.');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
