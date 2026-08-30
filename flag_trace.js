#!/usr/bin/env node
/* =============================================================================
   flag_trace.js  -  record the draw calls paintFlag() actually makes
   =============================================================================
   The crescent op was rewritten (it used to punch a transparent hole through the
   flag with globalCompositeOperation='destination-out'). A drawing fix has to be
   judged on pixels, but node-canvas is not installable here.

   So this does not re-implement anything: it runs the SHIPPED paintFlag() against
   a recording ctx that logs every call and every property set, and dumps the call
   list as JSON. flag_render.py then replays that list in PIL. If the recorded
   calls are wrong the picture will be wrong, which is the point - the oracle is
   the draw stream the real code emits, not a second copy of my intent.
   ========================================================================== */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC = fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
              .match(/<script>([\s\S]*?)<\/script>/)[1];

function recorder(){
  const calls=[];
  const state={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalCompositeOperation:'source-over'};
  const h={
    get(t,k){
      if (k==='__calls') return calls;
      if (k in state) return state[k];
      if (k==='canvas') return null;
      return (...a)=>{ calls.push([k, a, Object.assign({},state)]); };
    },
    set(t,k,v){ state[k]=v; calls.push(['#set:'+k, [v], {}]); return true; },
    has(){ return true; }
  };
  return new Proxy({},h);
}

const gfx=new Proxy({},{get:(_,k)=>(k==='width'||k==='height')?100:(k==='canvas'?null:()=>gfx),
                        set:()=>true, has:()=>true});
const sc=()=>({width:0,height:0,style:{},getContext:()=>gfx});
const sb={ console, Math, Map,Set,JSON,Array,Object,String,Number,Boolean,Date,Error,
  isNaN,parseInt,parseFloat,isFinite,
  performance:{now:()=>0}, requestAnimationFrame:()=>0, addEventListener:()=>{},
  setTimeout:()=>0, clearTimeout:()=>{}, innerWidth:1080, innerHeight:1920,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{getElementById:sc, createElement:sc} };
sb.window=sb; sb.globalThis=sb;
vm.createContext(sb); vm.runInContext(SRC, sb, {filename:'index.html'});
const API=sb.window.__CBR__;

// paintFlag is module-scope, not exported; pull it out of the context by name.
const paintFlag = vm.runInContext('paintFlag', sb);
if (typeof paintFlag!=='function'){ console.error('paintFlag not reachable'); process.exit(1); }

const WANT = (process.env.FLAGS||'TURKEY,PAKISTAN,MALAYSIA,SINGAPORE,ALGERIA,TUNISIA,AZERBAIJAN,LIBYA,UZBEKISTAN,JAPAN,BRAZIL,INDIA')
             .split(',');
const S=120, out={};
for (const name of WANT){
  const c=API.COUNTRIES.find(x=>x.name===name);
  if (!c){ console.error('missing flag:',name); continue; }
  const rec=recorder();
  paintFlag(rec, c.ops, S, Math.round(S*0.72));
  out[name]={w:S, h:Math.round(S*0.72), calls:rec.__calls,
             hasComposite: rec.__calls.some(k=>k[0]==='#set:globalCompositeOperation'
                                              && k[1][0]!=='source-over')};
}
fs.writeFileSync(path.join(__dirname,'flag_trace.json'), JSON.stringify(out));
console.log('traced', Object.keys(out).length, 'flags');
for (const [n,v] of Object.entries(out))
  console.log(`  ${n.padEnd(12)} ${String(v.calls.length).padStart(4)} calls   destructive-composite: ${v.hasComposite}`);
