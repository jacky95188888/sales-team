import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLinks} from '../growth-tools.mjs';

test('preserves repeated query values and fragment; replaces all old campaign fields', () => {
  const links = buildLinks('https://example.com/page?x=1&x=2&utm_source=old&UTM_SOURCE=old2&utm_term=old#faq', 'launch_2026', 'post_a');
  assert.equal(links.length,5);
  for (const link of links) {
    const url = new URL(link.url);
    assert.deepEqual(url.searchParams.getAll('x'),['1','2']);
    assert.equal(url.hash,'#faq');
    assert.equal(url.searchParams.get('utm_source'),link.source);
    assert.equal(url.searchParams.get('utm_campaign'),'launch_2026');
    assert.equal(url.searchParams.has('utm_term'),false);
    assert.equal(url.searchParams.has('UTM_SOURCE'),false);
    assert.notEqual(url.searchParams.get('utm_medium'),'paid_social');
  }
});
test('rejects executable URLs, embedded credentials and ambiguous campaign labels', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test','https://user:secret@example.com']) assert.throws(() => buildLinks(url,'launch','a'));
  for (const token of ['', 'Two Words', '中文', 'a'.repeat(81)]) assert.throws(() => buildLinks('https://example.com',token,'a'));
});
