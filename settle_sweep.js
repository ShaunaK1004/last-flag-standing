#!/usr/bin/env node
/* =============================================================================
   settle_sweep.js  -  choose CFG.SETTLE by measuring convergence, not by taste
   =============================================================================
   The opening layout has to place 64 balls in the r=107.5..445.5 annulus minus six
   spoke capsules. That is 66% packing of the reachable area, above the 54.7% where
   random sequential placement jams, so the layout is relaxed rather than rejected.
   This asks the only question that matters: how many relaxation passes until the
   worst residual overlap and the worst spoke penetration are both under a pixel,
   and does it converge at all or stall at a jam?

   Runs the SHIPPED newDraw()/settle()/project(), never a copy: loads index.html into
   a vm context exactly as verify_sim.js does.
   ========================================================================== */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC = fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
              .match(/<script>([\s\S]*?)<\/script>/)[1];

function load(override, seed){
  const gfx=new Proxy({},{get:(_,k)=>(k==='width'||k==='height')?100:(k==='canvas'?null:()=>gfx),
                          set:()=>true, has:()=>true});
  const sc=()=>({width:0,height:0,style:{},getContext:()=>gfx});
  let s=seed|0;
  const rnd=()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s);
                  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const sb={ console, Math:Object.create(Math), Map,Set,JSON,Array,Object,String,Number,
    Boolean,Date,Error,isNaN,parseInt,parseFloat,isFinite,
    performance:{now:()=>0}, requestAnimationFrame:()=>0, addEventListener:()=>{},
    setTimeout:()=>0, clearTimeout:()=>{}, innerWidth:1080, innerHeight:1920,
    localStorage:{getItem:()=>null, setItem:()=>{}},
    document:{getElementById:sc, createElement:sc},
    __CBR_OVERRIDE__: override };
  sb.Math.random=rnd; sb.window=sb; sb.globalThis=sb;
  vm.createContext(sb); vm.runInContext(SRC, sb, {filename:'index.html'});
  return sb.window.__CBR__;
}

// Independent geometry, computed here rather than asked of the game: the game's own
// project() is the thing under test, so it cannot also be the judge of its output.
function worstPen(API){
  const CFG=API.CFG, G=API.G, need=CFG.SPOKE_CAP+CFG.BALL_R;
  let pen=0, ov=0, rimOver=0;
  const A=G.balls.filter(b=>b.alive), segs=API.spokeSegs();
  for (const b of A){
    rimOver=Math.max(rimOver, Math.hypot(b.x,b.y)-(CFG.ARENA_R-CFG.BALL_R));
    for (const s of segs){
      const ex=s.bx-s.ax, ey=s.by-s.ay, L2=ex*ex+ey*ey;
      let t=((b.x-s.ax)*ex+(b.y-s.ay)*ey)/L2; t=t<0?0:t>1?1:t;
      pen=Math.max(pen, need-Math.hypot(b.x-(s.ax+ex*t), b.y-(s.ay+ey*t)));
    }
  }
  for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++)
    ov=Math.max(ov, CFG.BALL_R*2-Math.hypot(A[j].x-A[i].x, A[j].y-A[i].y));
  return {pen, ov, rimOver};
}

const SEEDS=12;
const p95=a=>{ const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.ceil(0.95*s.length)-1)]; };
console.log('passes |   overlap px  (max over 12 draws) |  spoke pen px  |  rim px | ms/draw');
let prevOv=Infinity;
for (const n of [0,10,25,50,100,200,400,800]){
  const ovs=[], pens=[], rims=[]; let ms=0;
  for (let s=0;s<SEEDS;s++){
    const t0=process.hrtime.bigint();
    const API=load({SETTLE:n}, 4242+s*7919);
    ms+=Number(process.hrtime.bigint()-t0)/1e6;
    const w=worstPen(API);
    ovs.push(w.ov); pens.push(w.pen); rims.push(w.rimOver);
  }
  const mx=a=>Math.max(...a);
  console.log(`${String(n).padStart(6)} | max ${mx(ovs).toFixed(3).padStart(8)}  p95 ${p95(ovs).toFixed(3).padStart(7)} `
    +`| max ${mx(pens).toFixed(3).padStart(8)} | ${mx(rims).toFixed(3).padStart(7)} | ${(ms/SEEDS).toFixed(1)}`);
  prevOv=mx(ovs);
}
console.log('\nnegative overlap/penetration = clearance to spare. 0.000 means exactly touching.');
console.log('ms/draw includes parsing index.html, so only the DIFFERENCE between rows is the settle cost.');
