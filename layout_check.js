#!/usr/bin/env node
/* =============================================================================
   layout_check.js  -  assert the new header layout from RECORDED draw calls
   =============================================================================
   The bug being fixed is a geometric one: "WHERE ARE / YOU FROM?" was drawn at
   baselines 412 and 466 while the arena's top edge is CY-ARENA_R = 377, so both
   lines landed inside the ring. Reading the source and believing the new numbers
   is exactly the mistake to avoid - the numbers are computed at runtime now
   (fitFont shrinks the brand, LAY drives the rest), so the only honest oracle is
   the stream of calls the shipped render code actually emits.

   So: run the real <script> in a vm, hand drawHUD/drawLower/render a RECORDING
   ctx, and judge the recording. Vertical extents come from the recorded baseline
   and the recorded font size, both exact. Horizontal extents need measureText,
   which no headless stub can get right, so those are evaluated at two advance
   ratios (0.60 normal bold caps, 0.70 a deliberately wide face) and reported as
   an estimate - never as a measurement.

     RATIO=0.7 node layout_check.js      # force the wide-face case
     DUMP=1     node layout_check.js     # also write layout_trace.json for PIL
   ========================================================================== */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'index.html'),'utf8')
            .match(/<script>([\s\S]*?)<\/script>/)[1];

const RATIO=parseFloat(process.env.RATIO||'0.60');   // assumed advance width per em

/* ---- recording ctx ---------------------------------------------------------
   Logs every call with a snapshot of the drawing state. measureText is the one
   thing it has to model; everything else is passthrough. */
function recorder(){
  const calls=[];
  const st={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,font:'10px sans-serif',
            textAlign:'start',globalAlpha:1,shadowBlur:0,shadowColor:'',
            globalCompositeOperation:'source-over',lineCap:'butt'};
  const sane=a=>a.map(v=>(v===null||['number','string','boolean'].includes(typeof v))
                          ?v:('<'+(typeof v)+'>'));
  // gradients record their own stops, so the PIL replay can paint the real colours
  // instead of me inventing a substitute for the arena floor.
  const mkGrad=(kind,args)=>{ const g={__kind:kind,__args:args,__stops:[],
    addColorStop(p,c){ g.__stops.push(p+'@'+c); }}; return g; };
  const gradTag=g=>'<grad|'+g.__kind+'|'+g.__args.join(',')+'|'+g.__stops.join(';')+'>';
  const h={
    get(t,k){
      if (k==='__calls') return calls;
      if (k in st) return st[k];
      if (k==='canvas') return {width:1080,height:1920};
      if (k==='measureText') return s=>{
        const px=parseFloat((st.font.match(/(\d+(?:\.\d+)?)px/)||[0,10])[1]);
        return {width:String(s).length*px*RATIO};
      };
      if (k==='createLinearGradient') return (...a)=>mkGrad('linear',a);
      if (k==='createRadialGradient') return (...a)=>mkGrad('radial',a);
      return (...a)=>{ calls.push([k,sane(a),Object.assign({},st)]); };
    },
    set(t,k,v){ st[k]=(v&&typeof v==='object'&&v.__stops)?gradTag(v)
                      :(typeof v==='object'&&v!==null)?'<object>':v;
                calls.push(['#set:'+k,[st[k]],{}]); return true; },
    has(){ return true; }
  };
  return new Proxy({},h);
}

// plain stub for the offscreen sprite canvases: they must NOT be recorded
const stub=new Proxy({},{get:(_,k)=>(k==='width'||k==='height')?100
                         :(k==='canvas'?null:(k==='measureText'?(()=>({width:50}))
                         :(k==='createLinearGradient'||k==='createRadialGradient')
                           ?(()=>({addColorStop(){}}))
                         :()=>stub)),
                         set:()=>true, has:()=>true});
const REC=recorder();
const mainCv={width:1080,height:1920,style:{},getContext:()=>REC};
const sprCv=()=>({width:0,height:0,style:{},getContext:()=>stub});

// an Image that loads successfully, so the bg branch of drawBackdrop is exercised
function FakeImage(){ this.naturalWidth=0; this.naturalHeight=0; }
Object.defineProperty(FakeImage.prototype,'src',{
  set(v){ this.__src=v; this.naturalWidth=1080; this.naturalHeight=1920;
          if (this.onload) this.onload(); }, get(){ return this.__src; }});

let NOW=0;
const sb={ console, Math, Map,Set,JSON,Array,Object,String,Number,Boolean,Date,Error,
  isNaN,parseInt,parseFloat,isFinite, Image:FakeImage,
  performance:{now:()=>NOW}, requestAnimationFrame:()=>0, addEventListener:()=>{},
  setTimeout:(f)=>0, clearTimeout:()=>{}, innerWidth:1080, innerHeight:1920,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  AudioContext:function(){ throw new Error('no audio'); },
  document:{ getElementById:id=>(id==='c'?mainCv:sprCv()), createElement:sprCv } };
sb.window=sb; sb.globalThis=sb;
vm.createContext(sb); vm.runInContext(SRC, sb, {filename:'index.html'});
const API=sb.window.__CBR__, CFG=API.CFG;
const drawHUD  = vm.runInContext('drawHUD',  sb);
const drawLower= vm.runInContext('drawLower',sb);
const render   = vm.runInContext('render',   sb);
const bgOk     = vm.runInContext('bgOk',     sb);
const LAY      = vm.runInContext('LAY',      sb);

/* ---- geometry helpers ------------------------------------------------------ */
const ARENA_TOP = CFG.CY-CFG.ARENA_R, ARENA_BOT = CFG.CY+CFG.ARENA_R;
const CAP=0.72, DESC=0.21;     // caps-height and descent as fractions of font px:
                               // conservative for any grotesque; DESC is generous
                               // since these strings have no descenders at all.
const px=f=>parseFloat((String(f).match(/(\d+(?:\.\d+)?)px/)||[0,10])[1]);

function texts(calls){
  return calls.filter(c=>c[0]==='fillText').map(c=>{
    const s=px(c[2].font);
    return { str:String(c[1][0]), x:c[1][1], y:c[1][2], size:s,
             top:c[1][2]-s*CAP, bot:c[1][2]+s*DESC,
             w:String(c[1][0]).length*s*RATIO, align:c[2].textAlign, font:c[2].font };
  });
}
function record(fn){ REC.__calls.length=0; fn(); return REC.__calls.slice(); }

/* ---- drive the sim into a normal mid-round frame --------------------------- */
let mul=(a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;})(20260825);
Math.random=mul;
API.newDraw();
const FR=1000/60;
for(let i=0;i<60*40;i++){ NOW+=FR; API.tick(FR); }   // ~40 s in: balls dead, phase CLOSED
const G=API.G;

let fail=0, n=0;
const chk=(name,ok,detail)=>{ n++; if(!ok) fail++;
  console.log(`${ok?'  ok  ':'  FAIL'}  ${name}${detail?'   ['+detail+']':''}`); };

console.log(`layout_check  -  advance ratio ${RATIO}, arena top y=${ARENA_TOP}, `+
            `bottom y=${ARENA_BOT}, phase ${G.phase}, dead ${G.dead.length}`);
console.log(`bg.jpg branch active in harness: ${bgOk}\n`);

/* ========================= 1. background ================================== */
console.log('background');
{
  const c=record(()=>render());
  const i1=c.findIndex(k=>k[0]==='drawImage');
  const first=c.slice(0,i1<0?4:i1+1);
  chk('the photo is drawn, and drawn first', i1>=0 && !first.some(k=>k[0]==='fillRect'
      && k[1][2]===1080), i1<0?'no drawImage at all':`drawImage is call #${i1}`);
  const d=i1>=0?c[i1][1]:[];
  chk('the photo covers the whole 1080x1920 canvas with no letterbox',
      d[1]===0 && d[2]===0 && d[3]===1080 && d[4]===1920, `dest ${d.slice(1,5)}`);
  const scrim=c.slice(i1+1,i1+4).find(k=>k[0]==='fillRect' && k[1][2]===1080 && k[1][3]===1920);
  chk('a full-canvas scrim follows it', !!scrim,
      scrim?`fillStyle ${scrim[2].fillStyle}`:'none found');
  chk('the scrim alpha is the measured 0.46', !!scrim && /0\.46\)/.test(scrim[2].fillStyle),
      scrim?scrim[2].fillStyle:'-');
  // the arena floor must stay translucent, or the photo cannot show through the ring
  const floors=c.filter(k=>k[0]==='#set:fillStyle' && /^<grad\|radial/.test(k[1][0]));
  chk('the arena floor is still a translucent radial gradient',
      floors.length>=2 && floors.some(k=>/rgba\([^)]*0\.85\)/.test(k[1][0])),
      `${floors.length} radial gradient fills; floor stops `+
      (floors.map(k=>k[1][0]).find(s=>/0\.85/.test(s))||'-').replace(/^<grad\|radial\|[^|]*\|/,'').replace(/>$/,''));
  // no old brand text anywhere in a full frame
  const all=texts(c).map(t=>t.str).join(' | ');
  for (const gone of ['COUNTRYBALL','ROYALE','SEND A GIFT TO SUPPORT THE STREAM'])
    chk(`old string "${gone}" is gone from the whole frame`, !all.includes(gone));
}

/* ========================= 2. header vs the ring ========================== */
console.log('\nheader clears the arena');
const H1=record(()=>drawHUD());
{
  const t=texts(H1);
  const worst=t.reduce((a,b)=>b.bot>a.bot?b:a,t[0]);
  chk('every line of header text ends above the ring',
      worst.bot < ARENA_TOP,
      `lowest is "${worst.str.trim()}" bottom y=${worst.bot.toFixed(1)}, `+
      `ring top y=${ARENA_TOP}, clearance ${(ARENA_TOP-worst.bot).toFixed(1)} px`);
  chk('clearance is at least 20 px, not a hairline', ARENA_TOP-worst.bot >= 20,
      `${(ARENA_TOP-worst.bot).toFixed(1)} px`);
  // and nothing the header draws - panels, gauge rings - dips into the ring either
  const shapes=H1.filter(k=>k[0]==='arc').map(k=>k[1][1]+k[1][2])
    .concat(H1.filter(k=>k[0]==='arcTo').map(k=>k[1][3]));
  const low=Math.max(...shapes);
  chk('no panel or gauge geometry reaches the ring', low < ARENA_TOP,
      `lowest header shape y=${low.toFixed(1)}`);

  const p=t.filter(x=>/WHERE ARE|YOU FROM/.test(x.str));
  chk('the prompt is the specific thing that moved: 2 lines, both above 377',
      p.length===2 && p.every(x=>x.bot<ARENA_TOP),
      p.map(x=>`"${x.str}" baseline ${x.y} (was 412/466)`).join('; '));
}

/* ========================= 3. brand ======================================= */
console.log('\nbrand');
{
  const t=texts(H1).filter(x=>/FLAGS|ARENA/.test(x.str));
  chk('brand renders as FLAGS WAR ARENA',
      t.map(x=>x.str).join('').trim().replace(/\s+/g,' ')==='FLAGS WAR ARENA',
      JSON.stringify(t.map(x=>x.str)));
  chk('it is a SINGLE line: every segment shares one baseline',
      t.length>0 && t.every(x=>x.y===t[0].y), `baselines ${[...new Set(t.map(x=>x.y))]}`);
  chk('two colours on that line (white + gold)',
      new Set(H1.filter(k=>k[0]==='fillText'&&/FLAGS|ARENA/.test(k[1][0]))
               .map(k=>k[2].fillStyle)).size===2);
  const right=t.reduce((a,x)=>Math.max(a,x.x+x.w),0);
  chk(`brand fits its ${LAY.brandW} px budget at ratio ${RATIO} (estimate, not a measurement)`,
      right <= LAY.brandX+LAY.brandW+0.5,
      `est. right edge ${right.toFixed(0)}, budget ends ${LAY.brandX+LAY.brandW}, `+
      `panel starts ${LAY.p1X}`);
  chk('brand never collides with the COUNTRIES panel', right < LAY.p1X,
      `${(LAY.p1X-right).toFixed(0)} px of gap`);
  chk('brand is on the same row as the panels', t[0].y>LAY.rowY && t[0].y<LAY.rowY+LAY.rowH,
      `baseline ${t[0].y} inside row ${LAY.rowY}..${LAY.rowY+LAY.rowH}`);
}

/* ========================= 4. band separation ============================= */
console.log('\nvertical stack');
{
  const t=texts(H1);
  const band=re=>{ const g=t.filter(x=>re.test(x.str)); return g.length
    ? [Math.min(...g.map(x=>x.top)), Math.max(...g.map(x=>x.bot))] : null; };
  const brand=band(/FLAGS|ARENA/), status=band(/CYCLE|RAPID/), prompt=band(/WHERE|YOU FROM/);
  const rowBot=LAY.rowY+LAY.rowH;
  chk('brand sits inside the header row', brand[0]>=LAY.rowY && brand[1]<=rowBot,
      `brand ${brand.map(v=>v.toFixed(0))} vs row ${LAY.rowY}..${rowBot}`);
  chk('status line is below the row', status[0]>rowBot,
      `gap ${(status[0]-rowBot).toFixed(1)} px`);
  chk('prompt is below the status line', prompt[0]>status[1],
      `gap ${(prompt[0]-status[1]).toFixed(1)} px`);
  chk('prompt is above the ring', prompt[1]<ARENA_TOP,
      `gap ${(ARENA_TOP-prompt[1]).toFixed(1)} px`);
  console.log(`        stack: row ${LAY.rowY}..${rowBot} | status `+
    `${status.map(v=>v.toFixed(0)).join('..')} | prompt ${prompt.map(v=>v.toFixed(0)).join('..')}`+
    ` | ring from ${ARENA_TOP}`);
}

/* ========================= 5. the status slot ============================= */
console.log('\nstatus slot is shared, so it cannot double up');
{
  const before=texts(H1).filter(x=>/CYCLE|RAPID/.test(x.str));
  chk('normally shows the cycle line', before.length===1 && /CYCLE/.test(before[0].str),
      before.map(x=>`"${x.str}"`).join());
  const save=G.rapidLeft; G.rapidLeft=3;
  const r=texts(record(()=>drawHUD())).filter(x=>/CYCLE|RAPID/.test(x.str));
  G.rapidLeft=save;
  chk('with RAPID FIRE armed, exactly one line still occupies the slot',
      r.length===1 && /RAPID/.test(r[0].str), r.map(x=>`"${x.str}"`).join());
  chk('the badge took the cycle line\'s baseline, not y=508 inside the ring',
      r.length===1 && r[0].y===before[0].y && r[0].bot<ARENA_TOP,
      `baseline ${r[0] && r[0].y} (was 508, which is ${508-ARENA_TOP} px inside the ring)`);
}

/* ========================= 6. lower band / CTA ============================ */
console.log('\nlower band');
{
  const c=record(()=>drawLower());
  const t=texts(c);
  const cta=t.find(x=>/LIKE IF YOU SEE/.test(x.str));
  chk('CTA reads LIKE IF YOU SEE YOUR COUNTRY FLAG', !!cta, cta?`"${cta.str}"`:'missing');
  chk('it carries the thumbs-up emoji U+1F44D', !!cta && cta.str.includes('\u{1F44D}'),
      cta?[...cta.str].slice(0,2).map(ch=>'U+'+ch.codePointAt(0).toString(16).toUpperCase()).join(' '):'-');
  chk('no words were added beyond the requested line',
      !!cta && cta.str.replace('\u{1F44D}','').trim()==='LIKE IF YOU SEE YOUR COUNTRY FLAG',
      cta?JSON.stringify(cta.str):'-');
  chk('the emoji font stack is present, so it cannot render as tofu',
      !!cta && /Emoji/.test(cta.font), cta?cta.font:'-');
  chk(`CTA fits the button's inner width at ratio ${RATIO} (estimate)`,
      !!cta && cta.w <= W_INNER(), `est. ${cta?cta.w.toFixed(0):'-'} px vs ${W_INNER()} px`);
  const ae=t.find(x=>/ALL ELIMINATED/.test(x.str));
  chk('ALL ELIMINATED starts below the ring', !!ae && ae.top>ARENA_BOT,
      `top ${ae.top.toFixed(0)} vs ring bottom ${ARENA_BOT}`);
  const btm=Math.max(...c.filter(k=>k[0]==='arcTo').map(k=>k[1][3]),
                     ...t.map(x=>x.bot));
  chk('nothing runs off the bottom of the canvas', btm<=1920,
      `lowest ink y=${btm.toFixed(0)} of 1920, ${(1920-btm).toFixed(0)} px margin`);
}
function W_INNER(){ return 1080-80-56; }

/* ========================= 7. wide-face robustness ======================== */
if (!process.env.RATIO){
  console.log('\nwide-face robustness (re-runs itself at ratio 0.70)');
  const out=require('child_process').spawnSync(process.argv[0],[__filename],
    {env:Object.assign({},process.env,{RATIO:'0.70',DUMP:''}),encoding:'utf8'});
  const bad=(out.stdout||'').split('\n').filter(l=>/^  FAIL/.test(l));
  chk('all checks still hold if system-ui resolves to a 17% wider face',
      bad.length===0, bad.length?bad.join(' ; '):'0 failures at ratio 0.70');
}

if (process.env.DUMP){
  const full=record(()=>render());
  fs.writeFileSync(path.join(__dirname,'layout_trace.json'),
    JSON.stringify({ratio:RATIO,arenaTop:ARENA_TOP,arenaBot:ARENA_BOT,
                    cfg:{CX:CFG.CX,CY:CFG.CY,ARENA_R:CFG.ARENA_R},calls:full}));
  console.log('\nwrote layout_trace.json');
}

console.log(`\n${fail?`${fail} of ${n} FAILED`:`all ${n} layout checks passed`}`);
process.exit(fail?1:0);
