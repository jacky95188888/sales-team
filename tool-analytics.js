// Aggregate page views only. No IP, account, query string or persistent visitor ID is stored.
export const ANALYTICS_TOOLS = ['fraud-lab', 'sales-team', 'n7k2-jl9x', 'dream-library', 'expert-council', 'tool'];
const origin = 'https://jacky95188888.github.io';
export function analyticsDay(offset=0) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
}
export async function toolAnalytics(req, env) {
  const headers={'Access-Control-Allow-Origin':origin,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if (!env.MONITOR) return reply({error:'ANALYTICS_NOT_CONFIGURED'},503);
  const url=new URL(req.url), tool=url.searchParams.get('tool');
  if (url.pathname === '/tool-analytics/track') {
    if(req.method!=='POST') return reply({error:'POST_ONLY'},405);
    if(req.headers.get('Origin')!==origin) return reply({error:'ORIGIN_DENIED'},403);
    if(Number(req.headers.get('content-length')||0)>2048) return reply({error:'TOO_LARGE'},413);
    const raw=await req.text();
    if(raw.length>2048) return reply({error:'TOO_LARGE'},413);
    let b; try{b=JSON.parse(raw)}catch{return reply({error:'INVALID_JSON'},400)}
    if(!ANALYTICS_TOOLS.includes(b.tool)||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(b.id||'')) return reply({error:'INVALID_EVENT'},400);
    const page=String(b.page||'').split(/[?#]/)[0];
    if(!page.startsWith('/'+b.tool+'/')||page.length>180||/[\x00-\x1f]/.test(page)||/admin|analytics|preview|test|demo/i.test(page)) return reply({error:'INVALID_PAGE'},400);
    const referrer=req.headers.get('Referer');
    if(referrer&&!referrer.startsWith(origin+'/')) return reply({error:'TOOL_MISMATCH'},403);
    // Each document has an immutable key: concurrent views never overwrite each other.
    const day=analyticsDay(),key=`toolviews:v1:${b.tool}:${day}:${b.id}`;
    await env.MONITOR.put(key,'1',{metadata:{day,page}});
    return reply({ok:true},202);
  }
  if(req.method!=='GET') return reply({error:'GET_ONLY'},405);
  if(!ANALYTICS_TOOLS.includes(tool)) return reply({error:'INVALID_TOOL'},400);
  const daily={},pages={};let cursor,startedAt=null,total=0,loops=0;
  do {
    const batch=await env.MONITOR.list({prefix:`toolviews:v1:${tool}:`,limit:1000,...(cursor?{cursor}:{})});
    for(const k of batch.keys){
      const d=k.metadata?.day;if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))continue;
      total++;daily[d]=(daily[d]||0)+1;if(!startedAt||d<startedAt)startedAt=d;
      if(d>=analyticsDay(-13)){const p=k.metadata.page;pages[p]=(pages[p]||0)+1;}
    }
    cursor=batch.list_complete?undefined:batch.cursor;
    if(++loops>=50&&cursor)return reply({error:'ANALYTICS_VOLUME_LIMIT'},503);
  }while(cursor);
  return reply({ok:true,tool,total,daily,pages,startedAt,timezone:'Asia/Taipei',metric:'page_views',consistency:'eventual',checkedAt:new Date().toISOString()});
}
