import assert from "node:assert/strict";
import { createApprovalRequest, listApprovalRequests, reviewApprovalRequest, executeApprovedRequest } from "../agent-approval-v1.js";

class MemoryKV {
  constructor(){ this.data=new Map(); }
  async get(k){ return this.data.get(k)||null; }
  async put(k,v){ this.data.set(k,v); }
}
const env={MONITOR:new MemoryKV()};
const proposal=await createApprovalRequest(env,{workspaceId:"safe-test",action:"threads.publish-post",summary:"測試貼文",diff:"將新增一篇 Threads 文字貼文",payload:{text:"hello"}});
assert.equal(proposal.status,"review_pending");
assert.equal((await listApprovalRequests(env,"safe-test")).items.length,1);
const approved=await reviewApprovalRequest(env,{workspaceId:"safe-test",proposalId:proposal.id,decision:"approved"});
assert.equal(approved.status,"approved");
let calls=0;
const executed=await executeApprovedRequest(env,{workspaceId:"safe-test",proposalId:proposal.id},async item=>{calls+=1;return {ok:true,action:item.action};});
assert.equal(executed.status,"executed");
assert.equal(calls,1);
await assert.rejects(()=>executeApprovedRequest(env,{workspaceId:"safe-test",proposalId:proposal.id},async()=>({ok:true})),/APPROVAL_ALREADY_EXECUTED/);
await assert.rejects(()=>createApprovalRequest(env,{workspaceId:"safe-test",action:"danger.delete-repo",payload:{}}),/APPROVAL_ACTION_NOT_ALLOWED/);
console.log("Agent approval gate test passed.");
