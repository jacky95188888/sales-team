import test from 'node:test';
import assert from 'node:assert/strict';
import {toolAnalytics,analyticsDay} from '../tool-analytics.js';
function fixture(){const records=new Map();return {records,MONITOR:{put:async(k,v,o)=>{records.set(k,{name:k,metadata:o.metadata})},list:async({prefix,cursor})=>{const keys=[...records.values()].filter(k=>k.name.startsWith(prefix));const at=Number(cursor||0);return {keys:keys.slice(at,at+2),list_complete:at+2>=keys.length,cursor:String(at+2)}}}};}
const event=(overrides={})=>({tool:'dream-library',id:crypto.randomUUID(),page:'/dream-library/',...overrides});
const track=b=>new Request('https://worker/tool-analytics/track',{method:'POST',headers:{Origin:'https://jacky95188888.github.io'},body:JSON.stringify(b)});
const stats=()=>new Request('https://worker/tool-analytics/stats?tool=dream-library');
test('concurrent views, retry deduplication, pagination and independent tools',async()=>{
 const env=fixture(),events=Array.from({length:9},()=>event());
 await Promise.all(events.map(e=>toolAnalytics(track(e),env)));
 await toolAnalytics(track(events[0]),env);
 await toolAnalytics(track(event({tool:'sales-team',page:'/sales-team/'})),env);
 const r=await toolAnalytics(stats(),env),d=await r.json();assert.equal(d.total,9);assert.equal(d.daily[analyticsDay()],9);assert.equal(d.pages['/dream-library/'],9);assert.equal(d.startedAt,analyticsDay());
 assert.ok([...env.records.values()].every(x=>Object.keys(x.metadata).sort().join(',')==='day,page'));
});
test('empty data is zero; missing storage is an error',async()=>{assert.equal((await (await toolAnalytics(stats(),fixture())).json()).total,0);assert.equal((await toolAnalytics(stats(),{})).status,503)});
test('reject management pages, unknown tools, mismatched paths and cross-origin writes',async()=>{
 const env=fixture();for(const overrides of [{page:'/dream-library/admin.html'},{page:'/sales-team/'},{tool:'unknown'},{id:'bad'}])assert.equal((await toolAnalytics(track(event(overrides)),env)).status,400);
 const r=track(event());r.headers.set('Origin','https://evil.example');assert.equal((await toolAnalytics(r,env)).status,403);assert.equal(env.records.size,0);
});
test('method and payload validation',async()=>{const env=fixture();assert.equal((await toolAnalytics(new Request('https://worker/tool-analytics/track'),env)).status,405);assert.equal((await toolAnalytics(track(event({page:'/dream-library/'+ 'a'.repeat(2100)})),env)).status,413)});

test('browser origin-only referrer is accepted',async()=>{const env=fixture(),r=track(event());r.headers.set('Referer','https://jacky95188888.github.io/');assert.equal((await toolAnalytics(r,env)).status,202);assert.equal(env.records.size,1)});
