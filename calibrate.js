#!/usr/bin/env node
/* =============================================================================
   calibrate.js  -  choose BALL_SPEED and SUCTION by measurement, not by taste
   =============================================================================
   Three independently measured targets from the reference clip:
     crowded open phase   median 0.97 s   (>=32 balls alive)
     sparse  open phase   mean   4.32 s   (<=4 balls alive)
     inward drift, open   mean  -50.6 design px/s  (-27 capture px/s)
   Two free parameters. So this is over-determined: if no (speed, suction) pair hits
   all three, the model is wrong and I need to say so rather than pick a compromise.

   Rather than simulate whole 6-minute rounds per config, this measures the two
   regimes directly:
     CROWDED - fresh 64-ball draw, take the first N openings.
     SPARSE  - a fixture that revives the eliminated ball after every kill, so four
               balls stay in play indefinitely and the sparse regime can be sampled
               as long as needed. The fixture only touches roster bookkeeping; the
               physics and the danger cycle are the shipped code, untouched.
   ========================================================================== */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC = fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
              .match(/<script>([\s\S]*?)<\/script>/)[1];

function load(override, seed){
  const gfx=new Proxy({},{get:(_,k)=>(k==='width'||k==='height')?100:(k==='canvas'?null:()=>gfx),
                          set:()=>true,has:()=>true});
  const sc=()=>({width:0,height:0,style:{},getContext:()=>gfx});
  const st={ NOW:0, timers:[], store:{} };
  let s=seed|0;
  const rnd=()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s);
                  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const sb={ console, Math:Object.create(Math), Map,Set,JSON,Array,Object,String,Number,
    Boolean,Date,Error,isNaN,parseInt,parseFloat,isFinite,
    performance:{now:()=>st.NOW}, requestAnimationFrame:()=>0, addEventListener:()=>{},
    setTimeout:(f,m)=>{ st.timers.push({at:st.NOW+(m||0),fn:f}); }, clearTimeout:()=>{},
    innerWidth:1080, innerHeight:1920,
    localStorage:{getItem:k=>k in st.store?st.store[k]:null, setItem:(k,v)=>{st.store[k]=String(v);}},
    document:{getElementById:sc, createElement:sc},
    __CBR_OVERRIDE__: override };
  sb.Math.random=rnd; sb.window=sb; sb.globalThis=sb;
  vm.createContext(sb); vm.runInContext(SRC, sb, {filename:'index.html'});
  return { API: sb.window.__CBR__, st };
}
const F=1000/60;
function frame(env){
  env.st.NOW+=F;
  env.st.timers.sort((a,b)=>a.at-b.at);
  while(env.st.timers.length && env.st.timers[0].at<=env.st.NOW) env.st.timers.shift().fn();
  env.API.tick(F);
}
const med=a=>{ if(!a.length)return NaN; const s=[...a].sort((x,y)=>x-y); const h=s.length>>1;
  return s.length%2?s[h]:(s[h-1]+s[h])/2; };
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;

/* ---- measure one config ------------------------------------------------- */
function measure(speed, suction, seed){
  const CROWD_N=24, SPARSE_N=60;

  // ---------- crowded ----------
  const FALL=parseFloat(process.env.FALL||'1');
  let e=load({BALL_SPEED:speed, SUCTION:suction, SUCTION_FALL:FALL}, seed);
  let A=e.API, C=A.CFG;
  let opens=[], drift=[], caps=0, pPhase=null, t0=0, guard=0;
  while (opens.length<CROWD_N && guard<60*400){
    guard++; frame(e); const G=A.G;
    if (G.phase!==pPhase){
      if (pPhase==='OPEN' && A.alive().length>=32) opens.push(e.st.NOW-t0);
      pPhase=G.phase; t0=e.st.NOW;
    }
    if (G.phase==='OPEN'){
      if (0) caps++;
      if (guard%4===0) for (const b of A.alive()){
        const d=Math.hypot(b.x,b.y); if(d>1) drift.push((b.vx*b.x+b.vy*b.y)/d); }
    }
  }
  const crowded=med(opens)/1000, drifted=mean(drift);

  // ---------- sparse: revive after every kill so 4 stay in play ----------
  e=load({BALL_SPEED:speed, SUCTION:suction, SUCTION_FALL:FALL}, seed+1);
  A=e.API; C=A.CFG;
  let G=A.G;
  // knock the roster down to 4 without touching the physics
  const keep=4;
  for (let i=keep;i<G.balls.length;i++){ G.balls[i].alive=false; G.dead.push({c:G.balls[i].c}); }
  let sOpens=[], pP=null, sT0=0, pDead=G.dead.length, sGuard=0, sCaps=0;
  while (sOpens.length<SPARSE_N && sGuard<60*900){
    sGuard++; frame(e);
    if (A.G!==G) break;                        // a draw ended: fixture failed, bail
    if (G.dead.length>pDead){                  // revive the ball that was just eaten
      const gone=G.dead.pop();
      const b=G.balls.find(x=>x.c.code===gone.c.code);
      const a=Math.random()*Math.PI*2, r=C.ARENA_R-C.BALL_R-8;
      b.alive=true; b.shield=false; b.x=Math.cos(a)*r; b.y=Math.sin(a)*r;
      const a2=Math.random()*Math.PI*2;
      b.vx=Math.cos(a2)*speed; b.vy=Math.sin(a2)*speed;
    }
    pDead=G.dead.length;
    if (G.phase!==pP){
      if (pP==='OPEN') sOpens.push(e.st.NOW-sT0);
      pP=G.phase; sT0=e.st.NOW;
    }
    if (0) sCaps++;
  }
  return { crowded, sparse:mean(sOpens)/1000, drift:drifted,
           nC:opens.length, nS:sOpens.length, caps, sCaps,
           cycle:(4.13+mean(sOpens.slice(0,3))/1000) };
}

/* ---- sweep -------------------------------------------------------------- */
const speeds  = (process.env.SPEEDS  || '150,180,210,250,300,330').split(',').map(Number);
const suctions= (process.env.SUCTIONS|| '70,100,140').split(',').map(Number);
const NSEED   = parseInt(process.env.NSEED || '1', 10);
/* Repeat every config over NSEED independent seeds. The sparse regime is a waiting time
   with a long right tail, so a single batch of 22 openings carries roughly a 20% standard
   error - enough to reorder the whole table by luck. Averaging over seeds and printing the
   standard error makes it visible whether a difference between two rows is real. */
const agg = a => { const m=a.reduce((x,y)=>x+y,0)/a.length;
  const sd=Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/Math.max(1,a.length-1));
  return {m, sem: a.length>1 ? sd/Math.sqrt(a.length) : NaN}; };

console.log('TARGETS  crowded 0.97 s | sparse 4.32 s | drift -50.6 px/s'
  + `   (${NSEED} seed${NSEED>1?'s':''} per config)`);
console.log('speed suct |      crowded        sparse |         drift | score');
let best=null;
for (const sp of speeds) for (const su of suctions){
  const runs=[];
  for (let s=0;s<NSEED;s++) runs.push(measure(sp,su,90210+s*7919));
  const C=agg(runs.map(r=>r.crowded)), S=agg(runs.map(r=>r.sparse)), D=agg(runs.map(r=>r.drift));
  const e1=Math.abs(C.m-0.97)/0.97, e2=Math.abs(S.m-4.32)/4.32, e3=Math.abs(D.m+50.6)/50.6;
  const score=Math.max(e1,e2,e3);
  const f=(o,d)=>`${o.m.toFixed(d)}${isNaN(o.sem)?'':'+-'+o.sem.toFixed(d)}`;
  console.log(`${String(sp).padStart(5)} ${String(su).padStart(4)} | `
    +`${f(C,2).padStart(13)} ${f(S,2).padStart(13)} | ${f(D,1).padStart(13)} | `
    +`${(score*100).toFixed(0)}%   (${e1*100|0}/${e2*100|0}/${e3*100|0})`);
  if (!best||score<best.score) best={sp,su,score,C,S,D};
}
console.log(`\nbest: BALL_SPEED=${best.sp} SUCTION=${best.su}  worst-target miss ${(best.score*100).toFixed(0)}%`);
console.log(`  crowded ${best.C.m.toFixed(2)} s (0.97)  sparse ${best.S.m.toFixed(2)} s (4.32)`
  +`  drift ${best.D.m.toFixed(1)} (-50.6)`);
