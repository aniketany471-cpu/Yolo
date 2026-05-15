const base = process.env.BASE_URL || 'http://localhost:5173';
const prompt = 'Reply with: API_OK';

async function j(url, opts={}){ const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opts}); let d={}; try{d=await r.json();}catch{} return {ok:r.ok,status:r.status,data:d}; }

const report={working:[],failed:[],slow:[],invalidConfigs:[]};

const state=await j('/api/state');
if(!state.ok){ console.error('state failed',state.status); process.exit(1); }
const cfg=state.data.config||{};

const providers=['bluesminds','gemini','groq','openrouter'];
let models=[cfg.activeModel||'gpt-4o-mini'];
const bm=await j('/api/bluesminds/models');
if(bm.ok&&Array.isArray(bm.data.models)&&bm.data.models.length){ models=[...new Set([cfg.activeModel,...bm.data.models.slice(0,8)].filter(Boolean))]; }

for(const provider of providers){
  const keyField=provider==='bluesminds'?'bluesmindsApiKey':provider==='gemini'?'geminiKey':provider==='groq'?'groqKey':'openRouterKey';
  if(!((cfg[keyField]||'').toString().trim()) && !(provider==='gemini' && process.env.GEMINI_API_KEY)){
    report.invalidConfigs.push(`${provider}: missing key`);
    continue;
  }
  const runModels = provider==='bluesminds'?models:[cfg.activeModel||models[0]];
  for(const model of runModels){
    const r=await j('/api/ai/test',{method:'POST',body:JSON.stringify({provider,model,prompt,stream:false})});
    const latency=r.data.latency||0;
    const entry=`${provider}/${model} (${latency}ms)`;
    if(r.ok && r.data.ok) report.working.push(entry); else report.failed.push(entry + ` => ${r.data.error||'empty response'}`);
    if(latency>8000) report.slow.push(entry);
  }
}

console.log(JSON.stringify(report,null,2));
if(report.failed.length) process.exitCode=2;
