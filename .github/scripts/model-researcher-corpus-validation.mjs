import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {readBilledUsage} from "../../operations/model-management/billing.mjs";
import {buildResearchControl,JEV_MODEL,JEV_ENDPOINT,jevQuote,jevCost,validateResearchControl} from "../../operations/model-management/jev.mjs";
import {officialCandidates} from "../../operations/model-management/prepare.mjs";
import {assessGroup,auditEvidence,budgetUsed,modelContract,modelGroups,reserve} from "../../operations/model-management/researcher.mjs";

const hash=text=>createHash("sha256").update(text).digest("hex");
const key=process.env.POLLINATIONS_API_KEY;
assert.ok(key);
assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1");
const out=process.env.RESEARCH_OUT;
await mkdir(out,{recursive:true});
const prior=JSON.parse(await readFile(join(process.env.CORPUS_OUT,"research.json"),"utf8"));
const inventory=JSON.parse(await readFile(join(process.env.CORPUS_OUT,"official-catalog.json"),"utf8"));
const current=await fetch("https://gen.pollinations.ai/models?reliability=all");
assert.ok(current.ok);
const jev=(await current.json()).find(row=>row.name===JEV_MODEL);
const baseline=budgetUsed(prior);
const report={startedAt:new Date().toISOString(),maxPollen:.05,reservedPollen:0,calls:[],sources:[...prior.sources],models:[],baselineAccountedPollen:baseline,status:"running",validationScope:"Saved official evidence and free primary refresh; no new market search or Sol inference"};
assert.ok(baseline+report.maxPollen<=4);
const save=()=>writeFile(join(out,"research.json"),JSON.stringify({...report,budgetUsedPollen:budgetUsed(report)},null,2));
await save();
const decision=async(payload,validate)=>{
    const billed=await readBilledUsage(key,report.startedAt);
    report.billing={...billed,callCount:report.calls.length};
    const quote=jevQuote(jev,payload);
    assert.ok(!prior.calls.some(call=>call.status==="pending"&&call.requestDigest===quote.requestDigest),"Never retry the old uncertain operation");
    const receipt=reserve(report,quote.reserved,`inference:${JEV_MODEL}`);
    receipt.requestDigest=quote.requestDigest;
    await save();
    const response=await fetch(`https://gen.pollinations.ai${JEV_ENDPOINT}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
    receipt.http=response.status;
    receipt.requestId=response.headers.get("x-request-id");
    assert.ok(response.ok,`Native HTTP ${response.status}`);
    const data=await response.json();
    receipt.nativeResponse=data;
    await save();
    try {
        receipt.observedPollen=jevCost(data.usage,quote);
        const result=validate(payload,data);
        receipt.accountedPollen=receipt.observedPollen;
        receipt.status="received";
        await save();
        console.log(JSON.stringify({calls:report.calls.length,accounted:budgetUsed(report),combinedAccounted:baseline+budgetUsed(report)}));
        return result;
    }catch(error){receipt.validationError=error.message;await save();throw error;}
};
try {
    const urls=["https://developers.openai.com/api/docs/pricing.md","https://docs.fireworks.ai/serverless/pricing","https://deepinfra.com/Qwen/Qwen3-Embedding-8B","https://fireworks.ai/models/fireworks/qwen3-embedding-8b"];
    for(const url of urls){
        const raw=execFileSync("python",["operations/model-management/fetch.py"],{input:JSON.stringify({url,mode:"http",maxCharacters:18000}),encoding:"utf8",env:{PATH:process.env.PATH,FETCH_CACHE_DIR:join(out,"pages")}});
        const source=JSON.parse(raw);
        assert.equal(source.status,"fetched",url);
        assert.equal(source.extractionVersion,2);
        const full=JSON.parse(await readFile(join(out,"pages",hash(url)+".json"),"utf8"));
        report.sources.push({...full,id:`refresh-${report.sources.length}`,status:"fetched",method:"scrapling-http",at:full.fetchedAt,digest:hash(full.text)});
    }
    const model="qwen/qwen3-embedding-8b";
    const control=buildResearchControl({stage:"followup",models:[model],actions:[{id:"find-azure",kind:"search",query:'"qwen3-embedding-8b" Azure managed API official pricing',engine:"exa",scope:"azure",mode:"web",models:[model]},{id:"finish",kind:"finish"}],evidence:"Saved source-backed Fireworks and DeepInfra embedding prices; Azure access and availability remain unknown. This validation records the plan without executing a search.",remainingPollen:.05});
    report.control=await decision(control,validateResearchControl);
    const contracts=inventory.map(modelContract);
    const initial=assessGroup(officialCandidates(contracts,report.sources),report.sources,new Map(),contracts,inventory,false);
    report.models=initial.models;
    await save();
    for(const models of modelGroups(contracts)){
        const names=new Set(models.map(({name})=>name));
        const first=report.models.filter(row=>names.has(row.name));
        const audited=await auditEvidence({models:first,routes:[],discoveries:[],gaps:[]},models,report.sources,decision);
        const final=assessGroup(audited,report.sources,new Map(),models,inventory,false);
        for(const row of final.models){
            const native=audited.models.find(item=>item.name===row.name);
            row.routes.forEach((route,index)=>{route.semanticAudit=native.routes[index].semanticAudit;});
            if(native.providerComparison)row.providerComparison=native.providerComparison;
            report.models[report.models.findIndex(item=>item.name===row.name)]=row;
        }
        await save();
    }
    const rates=new Map(report.models.map(row=>[row.name,row.routes]));
    for(const [name,provider,input,output] of [["openai/gpt-5.4-nano","openai.com",.2,1.25],["openai/gpt-5.4-mini","openai.com",.75,4.5],["openai/gpt-4o-mini","openai.com",.15,.6],["openai/gpt-5-nano","openai.com",.05,.4],["moonshotai/kimi-k3","fireworks",3,15],["z-ai/glm-5.3","fireworks",1.4,4.4],[model,"deepinfra.com",.01,null],[model,"fireworks",.1,null]]){
        const route=rates.get(name).find(route=>route.provider===provider&&route.pricing.input===input&&route.pricing.output===output);
        assert.ok(route,`Missing imported real price ${name}/${provider}`);
        assert.ok(route.priceEvidence.evidence.every(({quote,start,end})=>report.sources.find(source=>source.id===route.priceEvidence.sourceId).text.slice(start,end)===quote));
    }
    const comparison=rates.get(model);
    assert.ok(comparison.every(route=>route.runtimeVerified===false&&route.creditEligibility==="unknown"));
    assert.ok(report.models.find(row=>row.name===model).providerComparison,"Actual provider comparison must execute");
    report.status="complete";
}catch(error){report.status="blocked";report.reason=error.message.replaceAll(key,"[redacted]");process.exitCode=1;}
report.completedAt=new Date().toISOString();
report.billing={...await readBilledUsage(key,report.startedAt),callCount:report.calls.length};
assert.ok(baseline+budgetUsed(report)<=4);
await save();
console.log(JSON.stringify({status:report.status,reason:report.reason,models:report.models.length,calls:report.calls.length,accounted:budgetUsed(report),billed:report.billing.pollen,combinedAccounted:baseline+budgetUsed(report),postedPrices:report.models.flatMap(row=>row.routes).filter(route=>route.pricing.input!==null).length}));
