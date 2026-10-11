import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const start='2026-10-11T19:27:33Z', end='2026-10-11T19:44:30Z';
const url=new URL('https://gen.pollinations.ai/account/key/usage?limit=1000&days=2');
url.searchParams.set('before',end);
const response=await fetch(url,{headers:{Authorization:`Bearer ${process.env.POLLINATIONS_API_KEY}`},signal:AbortSignal.timeout(30000)});
assert.ok(response.ok,`Usage history HTTP ${response.status}`);
const body=await response.json();
assert.ok(Array.isArray(body.usage) && body.usage.length<1000,'Incomplete usage page');
const usage=body.usage.filter(r=>{const t=Date.parse(r.timestamp.replace(' ','T')+'Z'); return t>=Date.parse(start)&&t<=Date.parse(end);}).map(r=>({timestamp:r.timestamp,model:r.model,type:r.type,costPollen:r.cost_usd,input:r.input_text_tokens,read:r.input_cached_tokens,write:r.input_cache_write_tokens,output:r.output_text_tokens,reasoning:r.output_reasoning_tokens}));
assert.ok(usage.every(r=>Number.isFinite(r.costPollen)&&r.costPollen>=0),'Invalid charge');
const models={};for(const r of usage){const m=models[r.model]??={calls:0,costPollen:0};m.calls++;m.costPollen+=r.costPollen;}
const audit={validationRun:'38168073053',observedAt:new Date().toISOString(),calls:usage.length,totalPollen:usage.reduce((s,r)=>s+r.costPollen,0),researcherCalls:usage.filter(r=>r.model==='openai/gpt-6.1-sol').length,researcherPollen:usage.filter(r=>r.model==='openai/gpt-6.1-sol').reduce((s,r)=>s+r.costPollen,0)};
await mkdir(process.env.RESEARCH_OUT,{recursive:true});
await writeFile(process.env.RESEARCH_OUT+'/billing-audit.json',JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit));
