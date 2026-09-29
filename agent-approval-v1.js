/* Agent Approval Gate V1
 * Human approval boundary for side-effecting actions.
 * Proposals are immutable after creation; approved actions execute at most once.
 */
const VERSION = 1;
const MAX_ITEMS = 50;
function clean(v,n=1000){ return String(v ?? "").trim().slice(0,n); }
function workspace(v){ const id=clean(v,80).replace(/[^a-zA-Z0-9_-]/g,""); if(!id) throw Object.assign(new Error("WORKSPACE_ID_REQUIRED"),{status:400}); return id; }
function proposalKey(id,pid){ return `approval:v${VERSION}:${workspace(id)}:${clean(pid,120)}`; }
function listKey(id){ return `approval:v${VERSION}:${workspace(id)}:list`; }
function allowedAction(action){ return ["threads.publish-post","threads.publish-reply"].includes(action); }
async function load(env,id,pid){ if(!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"),{status:503}); const raw=await env.MONITOR.get(proposalKey(id,pid)); if(!raw) throw Object.assign(new Error("APPROVAL_PROPOSAL_NOT_FOUND"),{status:404}); return JSON.parse(raw); }
async function save(env,item){ await env.MONITOR.put(proposalKey(item.workspaceId,item.id),JSON.stringify(item),{expirationTtl:60*60*24*30}); return item; }

export async function createApprovalRequest(env, body={}){
  if(!env.MONITOR) throw Object.assign(new Error("MONITOR_NOT_CONFIGURED"),{status:503});
  const workspaceId=workspace(body.workspaceId), action=clean(body.action,100);
  if(!allowedAction(action)) throw Object.assign(new Error("APPROVAL_ACTION_NOT_ALLOWED"),{status:400});
  const item={id:crypto.randomUUID(),workspaceId,action,status:"review_pending",summary:clean(body.summary,1200),diff:clean(body.diff,5000),payload:body.payload&&typeof body.payload==="object"?body.payload:{},createdAt:Date.now(),reviewedAt:null,executedAt:null,result:null};
  await save(env,item);
  let ids=[]; try{ ids=JSON.parse((await env.MONITOR.get(listKey(workspaceId)))||"[]"); }catch{}
  await env.MONITOR.put(listKey(workspaceId),JSON.stringify([item.id,...ids.filter(x=>x!==item.id)].slice(0,MAX_ITEMS)),{expirationTtl:60*60*24*30});
  return item;
}
export async function getApprovalRequest(env,workspaceId,proposalId){ return load(env,workspaceId,proposalId); }
export async function listApprovalRequests(env,workspaceId){
  const id=workspace(workspaceId); let ids=[]; try{ids=JSON.parse((await env.MONITOR.get(listKey(id)))||"[]");}catch{}
  const items=[]; for(const pid of ids.slice(0,MAX_ITEMS)){ try{items.push(await load(env,id,pid));}catch{} } return {workspaceId:id,items};
}
export async function reviewApprovalRequest(env,body={}){
  const item=await load(env,body.workspaceId,body.proposalId);
  if(item.status!=="review_pending") throw Object.assign(new Error("APPROVAL_ALREADY_REVIEWED"),{status:409});
  const decision=body.decision==="approved"?"approved":body.decision==="rejected"?"rejected":"";
  if(!decision) throw Object.assign(new Error("APPROVAL_DECISION_REQUIRED"),{status:400});
  item.status=decision; item.reviewNote=clean(body.reviewNote,1200); item.reviewedAt=Date.now(); return save(env,item);
}
export async function executeApprovedRequest(env,body={},executor){
  const item=await load(env,body.workspaceId,body.proposalId);
  if(item.status!=="approved") throw Object.assign(new Error(item.status==="executed"?"APPROVAL_ALREADY_EXECUTED":"APPROVAL_REQUIRED"),{status:409});
  item.status="executing"; await save(env,item);
  try{
    const result=await executor(item);
    item.status="executed"; item.executedAt=Date.now(); item.result=result&&typeof result==="object"?result:{ok:true}; await save(env,item); return item;
  }catch(error){
    item.status="approved"; item.lastError=clean(error?.message||error,800); await save(env,item); throw error;
  }
}
