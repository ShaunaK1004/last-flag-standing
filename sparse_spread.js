#!/usr/bin/env node
/* =============================================================================
   sparse_spread.js  -  is the sparse-open target actually estimable?
   =============================================================================
   verify_sim.js gates on mean(open duration | <=4 alive) against a reference of
   4.32 s. One run reported 8.89 s and failed by 4.57 s. Before touching any
   constant I need to know whether that number is a regression or just noise:
   a draw contributes only ~3 sparse openings (64 -> 1 passes through <=4 alive
   very briefly), so a 4-round run has n~11, and the distribution is bounded
   below by ~0 and unbounded above. That is the textbook shape for a mean with a
   huge standard error.

   This measures the ESTIMATOR's own spread across independent seeds, doing the
   minimum work needed: it drives the shipped tick() directly and records open
   durations only, with no other bookkeeping.

   Reports both mean and median, because if the median is stable while the mean
   is not, the estimator - not the game - is what is broken.
   ========================================================================== */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC = fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
              .match(/<script>([\s\S]*?)<\/script>/)[1];

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

function run(seed, rounds){
  let NOW=0;
  const gfx=new Proxy({},{get:(_,k)=>(k==='width'||k==='height')?100:(k==='canvas'?null:()=>gfx),
                          set:()=>true, has:()=>true});
  const sc=()=>({width:0,height:0,style:{},getContext:()=>gfx});
  const sb={ console, Math:Object.create(Math), Map,Set,JSON,Array,Object,String,Number,
    Boolean,Date,Error,isNaN,parseInt,parseFloat,isFinite,
    performance:{now:()=>NOW}, requestAnimationFrame:()=>0, addEventListener:()=>{},
    setTimeout:()=>0, clearTimeout:()=>{}, innerWidth:1080, innerHeight:1920,
    localStorage:{getItem:()=>null,setItem:()=>{}},
    document:{getElementById:sc, createElement:sc} };
  sb.Math.random=mulberry32(seed); sb.window=sb; sb.globalThis=sb;
  vm.createContext(sb); vm.runInContext(SRC, sb, {filename:'index.html'});
  const API=sb.window.__CBR__;

  const FRAME=1000/60;
  const sparse=[], crowded=[];
  let pPhase=null, t0=0, aliveAtOpen=0, done=0, guard=0;
  let Gref=API.G;
  while (done<rounds && guard++ < 6e6){
    // tick() takes a DELTA, not a timestamp. My first version passed the absolute clock,
    // which advanced tPhase by the whole elapsed time every frame, so every phase completed
    // in one frame and EVERY duration came out at 0.03 s - including the crowded ones, which
    // is what gave the mistake away, since verify_sim.js reports 0.93 s by the same route.
    NOW+=FRAME; API.tick(FRAME);
    const G=API.G;
    if (G!==Gref){ Gref=G; pPhase=null; }
    if (G.phase!==pPhase){
      if (pPhase==='OPEN'){
        const d=NOW-t0;
        if (aliveAtOpen<=4) sparse.push(d);
        if (aliveAtOpen>=32) crowded.push(d);
      }
      if (G.phase==='OPEN'){ t0=NOW; aliveAtOpen=API.alive().length; }
      if (G.phase==='WINNER' && pPhase!=='WINNER') done++;
      pPhase=G.phase;
    }
  }
  return {sparse, crowded};
}

const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
const med=a=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y);
  return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };
const sd=a=>{ if(a.length<2) return NaN; const m=mean(a);
  return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)); };

const ROUNDS=parseInt(process.env.ROUNDS||'4',10);
const SEEDS=(process.env.SEEDS||'42,7,1234,99,20260825,555,8888,31337').split(',').map(Number);

console.log(`ROUNDS=${ROUNDS} per seed;  sparse = open duration when <=4 alive\n`);
console.log('seed        n  sparse mean  sparse med   crowded med');
const allSparse=[], means=[], meds=[];
for (const s of SEEDS){
  const r=run(s,ROUNDS);
  allSparse.push(...r.sparse);
  means.push(mean(r.sparse)/1000); meds.push(med(r.sparse)/1000);
  console.log(`${String(s).padStart(9)} ${String(r.sparse.length).padStart(3)}  `
    +`${(mean(r.sparse)/1000).toFixed(2).padStart(10)} s `
    +`${(med(r.sparse)/1000).toFixed(2).padStart(10)} s `
    +`${(med(r.crowded)/1000).toFixed(2).padStart(11)} s`);
}
console.log('\n--- the estimator itself ---');
console.log(`per-seed sparse MEAN  : ${mean(means).toFixed(2)} s, sd across seeds ${sd(means).toFixed(2)} s  (range ${Math.min(...means).toFixed(2)}..${Math.max(...means).toFixed(2)})`);
console.log(`per-seed sparse MEDIAN: ${mean(meds).toFixed(2)} s, sd across seeds ${sd(meds).toFixed(2)} s  (range ${Math.min(...meds).toFixed(2)}..${Math.max(...meds).toFixed(2)})`);
const pooled=allSparse.map(v=>v/1000).sort((a,b)=>a-b);
console.log(`\npooled n=${pooled.length}: mean ${mean(pooled).toFixed(2)} s  median ${med(pooled).toFixed(2)} s  sd ${sd(pooled).toFixed(2)} s`);
console.log(`pooled deciles: ${[0.1,0.25,0.5,0.75,0.9,0.99].map(p=>pooled[Math.min(pooled.length-1,Math.floor(p*pooled.length))].toFixed(2)).join('  ')}`);
console.log(`max ${pooled[pooled.length-1].toFixed(2)} s  -> skew: mean/median = ${(mean(pooled)/med(pooled)).toFixed(2)}`);
console.log(`\nse of a mean at n=${Math.round(pooled.length/SEEDS.length)} (one 4-round run) = ${(sd(pooled)/Math.sqrt(pooled.length/SEEDS.length)).toFixed(2)} s`);
