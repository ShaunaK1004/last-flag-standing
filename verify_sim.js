#!/usr/bin/env node
/* =============================================================================
   verify_sim.js  -  headless verification harness for countryball-royale/index.html
   =============================================================================
   Rules I am holding myself to here:

   * The harness does NOT contain a copy of the physics. It extracts the actual
     <script> from index.html and runs it against stub DOM/audio/timer objects, so
     what is measured is the shipped code. A reimplementation would be the code
     under test acting as its own oracle.
   * Every threshold below is either a measured figure from the reference clip or
     a pure geometric invariant. No threshold is "whatever the sim happens to do".
   * Events are detected from MECHANICAL state (killQuota, tumbleT, rapidLeft,
     shield flags, roster membership), never from the banner text the game prints.
     A banner is the game telling me what it thinks it did; state is what it did.
   * Time is virtual: performance.now(), setTimeout and the frame loop are all
     driven by a counter I advance, so a 6-minute round costs a few seconds and
     the numbers are reproducible.
   * Math.random is replaced by a seeded PRNG, so a FAIL can be re-run.

   Usage:  node verify_sim.js [rounds] [seed] [k=v ...]
     e.g.  node verify_sim.js 3 7 SUCTION=150 BALL_SPEED=330
   ========================================================================== */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, 'index.html');
const argv = process.argv.slice(2);
const ROUNDS = parseInt(argv[0] || '4', 10);
const SEED   = parseInt(argv[1] || '20260825', 10);
const OVERRIDE = {};
for (const a of argv.slice(2)){ const [k,v]=a.split('='); if(k&&v!==undefined) OVERRIDE[k]=parseFloat(v); }
const QUIET = !!process.env.CBR_QUIET;

function mulberry32(a){ return function(){
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};}

/* ---------- stub canvas: absorbs every 2D call, returns itself ----------- */
const gfx = new Proxy({}, {
  get(_, k){
    if (k === 'width' || k === 'height') return 100;
    if (k === 'canvas') return null;
    return () => gfx;
  },
  set(){ return true; }, has(){ return true; },
});
const stubCanvas = () => ({ width:0, height:0, style:{}, getContext:()=>gfx });

let NOW = 0;
const timers = [];
function pumpTimers(){
  timers.sort((a,b)=>a.at-b.at);
  while (timers.length && timers[0].at <= NOW){ const t = timers.shift(); try{ t.fn(); }catch(e){} }
}

const store = {};
const sandbox = {
  console, Math: Object.create(Math),
  Map, Set, JSON, Array, Object, String, Number, Boolean, Date, Error, isNaN, parseInt, parseFloat, isFinite,
  performance: { now: () => NOW },
  requestAnimationFrame: () => 0,
  addEventListener: () => {},
  setTimeout: (fn, ms) => { timers.push({at: NOW + (ms||0), fn}); return timers.length; },
  clearTimeout: () => {},
  innerWidth: 1080, innerHeight: 1920,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
  },
  document: { getElementById: stubCanvas, createElement: stubCanvas },
  __CBR_OVERRIDE__: Object.keys(OVERRIDE).length ? OVERRIDE : null,
};
sandbox.Math.random = mulberry32(SEED);
sandbox.window = sandbox; sandbox.globalThis = sandbox;

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FATAL: no <script> block in index.html'); process.exit(2); }
if (!QUIET) console.log(`extracted ${m[1].length} chars of game script from ${path.basename(HTML)}`
  + (Object.keys(OVERRIDE).length ? `   overrides ${JSON.stringify(OVERRIDE)}` : ''));

vm.createContext(sandbox);
try { vm.runInContext(m[1], sandbox, {filename:'index.html'}); }
catch(e){ console.error('FATAL: game script threw at load:\n', e); process.exit(2); }

const API = sandbox.window.__CBR__;
if (!API) { console.error('FATAL: window.__CBR__ not exported'); process.exit(2); }
const { CFG, COUNTRIES } = API;
const tick = API.tick, alive = API.alive;

/* ========================================================================== */
const fails = [];
function chk(label, ok, detail){
  if (!QUIET) console.log(`${ok?'ok  ':'FAIL'} ${label.padEnd(46)} ${detail}`);
  if (!ok) fails.push(label);
}
const say = (...a) => { if(!QUIET) console.log(...a); };
const med = a => { if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); const h=s.length>>1;
  return s.length%2 ? s[h] : (s[h-1]+s[h])/2; };
const pct = (a,p) => { if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y);
  return s[Math.min(s.length-1, Math.floor(p/100*s.length))]; };
const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;

/* ---- static checks ------------------------------------------------------ */
say('\n--- static ---');
// This used to assert COUNTRIES.length===64, conflating two different quantities: the FIELD
// (64 balls, read off the reference's COUNTRIES panel) and the POOL they are drawn from. The
// direction says each cycle starts with "a new set of 64 countries ... determined by the
// system", which is unsatisfiable when pool===field. So the invariant is now: the field is
// exactly 64, and the pool is strictly larger so the set can actually differ round to round.
chk('field size = 64 (reference COUNTRIES panel)', CFG.N_BALLS === 64, `got ${CFG.N_BALLS}`);
chk('pool larger than the field, so the set can vary', COUNTRIES.length > CFG.N_BALLS,
    `pool ${COUNTRIES.length}, field ${CFG.N_BALLS}`);
chk('country codes unique', new Set(COUNTRIES.map(c=>c.code)).size === COUNTRIES.length, '');
chk('country names unique', new Set(COUNTRIES.map(c=>c.name)).size === COUNTRIES.length, '');
chk('every country has a name and ops',
    COUNTRIES.every(c=>c.name && c.name.length>1 && Array.isArray(c.ops) && c.ops.length>0), '');

// The shuffle is the thing that makes the pool worth having, so test it directly rather than
// trusting that a Fisher-Yates I just wrote is uniform. Two questions: does the field differ
// between draws, and is every country reachable? A biased shuffle (or an off-by-one in the
// loop bound) would leave some country permanently on the bench, which no eyeball would catch.
{
  const seen=new Map(); let fields=[];
  for (let d=0; d<300; d++){
    API.newDraw();
    const codes=API.G.balls.map(b=>b.c.code);
    fields.push(codes.join(','));
    for (const c of codes) seen.set(c,(seen.get(c)||0)+1);
  }
  const distinct=new Set(fields).size;
  chk('the drawn field varies between rounds', distinct === 300, `${distinct}/300 distinct fields`);
  chk('every country in the pool can be drawn', seen.size === COUNTRIES.length,
      `${seen.size}/${COUNTRIES.length} appeared in 300 draws`);
  // expected appearances per country = 300 * 64/100 = 192; binomial sd = sqrt(300*.64*.36)=8.3
  const exp=300*CFG.N_BALLS/COUNTRIES.length, sd=Math.sqrt(300*(CFG.N_BALLS/COUNTRIES.length)*(1-CFG.N_BALLS/COUNTRIES.length));
  const counts=[...seen.values()], lo=Math.min(...counts), hi=Math.max(...counts);
  const worst=Math.max(Math.abs(lo-exp),Math.abs(hi-exp))/sd;
  chk('draw is unbiased: no country favoured beyond 4 sigma', worst < 4,
      `range ${lo}..${hi}, expected ${exp.toFixed(0)} +- ${sd.toFixed(1)}, worst ${worst.toFixed(2)} sigma`);
}

const rat=(a,b)=>a/b;
chk('hub/arena ratio = 0.264 (measured)',
    Math.abs(rat(CFG.HUB_R,CFG.ARENA_R)-0.264)<0.004, rat(CFG.HUB_R,CFG.ARENA_R).toFixed(4));
chk('ball/arena ratio = 0.0776 (measured)',
    Math.abs(rat(CFG.BALL_R,CFG.ARENA_R)-0.0776)<0.002, rat(CFG.BALL_R,CFG.ARENA_R).toFixed(4));
chk('hole/arena ratio = 0.1366 (measured)',
    Math.abs(rat(CFG.HOLE_R,CFG.ARENA_R)-0.1366)<0.003, rat(CFG.HOLE_R,CFG.ARENA_R).toFixed(4));
chk('spoke inner radius = 139 capture px (measured)', Math.abs(CFG.SPOKE_IN-139*1.875)<3,
    `${CFG.SPOKE_IN} vs ${(139*1.875).toFixed(1)}`);
chk('spoke outer radius = 247 capture px (measured)', Math.abs(CFG.SPOKE_OUT-247*1.875)<3,
    `${CFG.SPOKE_OUT} vs ${(247*1.875).toFixed(1)}`);
chk('spoke tip gap < ball diameter (rim end sealed)',
    CFG.ARENA_R-CFG.SPOKE_OUT-CFG.SPOKE_CAP < CFG.BALL_R*2,
    `gap ${(CFG.ARENA_R-CFG.SPOKE_OUT-CFG.SPOKE_CAP).toFixed(1)} px vs ball dia ${CFG.BALL_R*2}`);

// Static proof that the wall-projection order in project() is safe: the outer spoke cap is
// unreachable, so spoke push-out never fights the rim clamp. (The hub is not a collider, so
// there is no hub-vs-spoke ordering question any more - see the closed-hub check below.)
chk('spoke outer cap unreachable by a ball centre',
    CFG.ARENA_R-CFG.BALL_R < CFG.SPOKE_OUT,
    `max centre r ${(CFG.ARENA_R-CFG.BALL_R).toFixed(1)} < tip r ${CFG.SPOKE_OUT}`);

const annulus = Math.PI*(CFG.ARENA_R**2-CFG.HUB_R**2);
const packing = 64*Math.PI*CFG.BALL_R**2/annulus;
chk('packing at 64 balls = 41.5% (measured)', Math.abs(packing-0.415)<0.015,
    `${(packing*100).toFixed(1)}%  (hex limit 90.7%)`);
chk('spoke revolution = 12.86 s (measured 28 deg/s)',
    Math.abs(360/Math.abs(CFG.SPOKE_DEG_S)-12.857)<0.05, `${(360/Math.abs(CFG.SPOKE_DEG_S)).toFixed(3)} s`);

/* ---- dynamic run ------------------------------------------------------- */
say(`\n--- simulating ${ROUNDS} draws (seed ${SEED}) ---`);
const FRAME = 1000/60;

let maxRimOver=0, maxOverlap=0, maxSpokePen=0, maxSpeedErr=0, nanSeen=false;
let worstPen=null, worstOv=null, maxSettle=API.G.settleResidual||0;
let minClosedR=1e9, closedFrames=0, closedFramesWithBallOnHub=0;
let openRadialV=[], openRadialN=0;
const closedDur=[], openDur=[], perOpen=[], roundLen=[], gaps=[];
const openCrowded=[], openSparse=[];
const ev={double:0, shield:0, tumble:0, rapid:0, comeback:0};
let openings=0, kills=0, lastKillAt=null, roundsDone=0, guard=0, spawnSkips=0;
const winners=[];

// observer state
let pPhase=null, phaseT0=0, pDead=0, pQuota=1, pTumble=0, pRapid=0, pShield=false, pAliveN=0;
let curOpen=null, wasRapidClosed=false;
let spokePrev=null, spokeAccum=0, spokeElapsed=0, spokePrevT=0;
let Gref = API.G;

function inspect(G){
  const A = alive();
  let onHub = false;
  for (const b of A){
    const d=Math.hypot(b.x,b.y);
    if(!isFinite(d)||!isFinite(b.vx)||!isFinite(b.vy)) nanSeen=true;
    maxRimOver=Math.max(maxRimOver,d-(CFG.ARENA_R-CFG.BALL_R));
    const sp=Math.hypot(b.vx,b.vy);
    const want=CFG.BALL_SPEED*(G.tumbleT>0?CFG.TUMBLE_SPEED:1);
    maxSpeedErr=Math.max(maxSpeedErr,Math.abs(sp-want)/want);
    // The hub is floor, not wall (measured: 43 ball centres strictly inside the hub disc
    // over 484 steady-CLOSED reference frames, closest at 9 design px). So instead of an
    // invented "nothing may be inside the hub" invariant, check the sim reproduces the
    // crossings: 165 design px is the closest a ball centre could get if it WERE a wall.
    if (G.phase==='CLOSED'){
      minClosedR=Math.min(minClosedR,d);
      if (d < CFG.HUB_R+CFG.BALL_R) onHub = true;
    }
    if (G.phase==='OPEN' && d>1){                     // radial velocity, for the drift cross-check
      openRadialV.push((b.vx*b.x+b.vy*b.y)/d); openRadialN++;
    }
    for (const s of API.spokeSegs()){
      const ex=s.bx-s.ax, ey=s.by-s.ay, L2=ex*ex+ey*ey;
      let t=((b.x-s.ax)*ex+(b.y-s.ay)*ey)/L2; t=t<0?0:t>1?1:t;
      const pen=(CFG.SPOKE_CAP+CFG.BALL_R)-Math.hypot(b.x-(s.ax+ex*t),b.y-(s.ay+ey*t));
      if (pen>maxSpokePen){ maxSpokePen=pen; worstPen=ctx(G,A.length,b,{t:t.toFixed(2)}); }
    }
  }
  if (G.phase==='CLOSED'){ closedFrames++; if (onHub) closedFramesWithBallOnHub++; }
  for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++){
    const ov=CFG.BALL_R*2-Math.hypot(A[j].x-A[i].x,A[j].y-A[i].y);
    if (ov>maxOverlap){ maxOverlap=ov; worstOv=ctx(G,A.length,A[i],{with:A[j].c.code}); }
  }
}

/* Context for the worst violation, so a failure names its own cause instead of inviting me
   to guess one. Twice now I have hypothesised a mechanism from a bare number and been wrong. */
function ctx(G,n,b,extra){
  return Object.assign({phase:G.phase, tPhase:Math.round(G.tPhase), alive:n, roundNo:G.roundNo,
    sinceDraw:Math.round(G.t), r:Math.round(Math.hypot(b.x,b.y)), code:b.c.code}, extra);
}

/* Observation runs AFTER tick(), so a kill and the closeHub() it triggers are both
   visible in the same pass. The first version of this harness observed before tick()
   and therefore closed the book on every opening one frame before its kill landed:
   it reported 0 kills per opening for 59 of 62 openings. The game was fine. */
while (roundsDone < ROUNDS && guard < 60*60*60*6){
  guard++;
  NOW += FRAME;
  pumpTimers();
  tick(FRAME);
  const G = API.G;

  if (G !== Gref){                                   // newDraw() replaced the state object
    spawnSkips += Gref.spawnSkips|0;                 // bank it before the counter is reset
    Gref=G; pPhase=null; pDead=0; pQuota=1; pTumble=0; pRapid=0; pShield=false;
    curOpen=null; lastKillAt=null; spokePrev=null; phaseT0=NOW;
    maxSettle=Math.max(maxSettle, G.settleResidual||0);   // layout quality of the NEW draw
  }

  // --- kills, from the roster ------------------------------------------------
  if (G.dead.length > pDead){
    const d=G.dead.length-pDead;
    kills+=d;
    if (curOpen) curOpen.n+=d;
    if (lastKillAt!==null) gaps.push((NOW-lastKillAt)/1000);
    lastKillAt=NOW;
  } else if (G.dead.length < pDead && G.phase!=='INTRO' && pPhase!=='WINNER'){
    ev.comeback++;                                   // a country left the eliminated roster
  }
  pDead=G.dead.length;

  // --- events, from mechanical state ----------------------------------------
  if (G.killQuota>1 && pQuota<=1){ ev.double++; if(curOpen) curOpen.dbl=true; }
  pQuota=G.killQuota;
  if (G.tumbleT>0 && pTumble<=0) ev.tumble++;
  pTumble=G.tumbleT;
  if (G.rapidLeft>pRapid && pRapid===0) ev.rapid++;
  pRapid=G.rapidLeft;
  const shieldNow = G.balls.some(b=>b.alive&&b.shield);
  if (shieldNow && !pShield) ev.shield++;
  pShield=shieldNow;

  // --- phase edges -----------------------------------------------------------
  if (G.phase!==pPhase){
    const dur=NOW-phaseT0;
    if (pPhase==='CLOSED' && !wasRapidClosed) closedDur.push(dur);
    if (pPhase==='OPEN' && curOpen){
      openDur.push(dur); curOpen.dur=dur; perOpen.push(curOpen);
      if (curOpen.alive>=32) openCrowded.push(dur);
      else if (curOpen.alive<=4) openSparse.push(dur);
      curOpen=null;
    }
    if (G.phase==='OPEN'){ openings++; curOpen={n:0, dbl:G.killQuota>1, alive:alive().length, shieldOn:shieldNow}; }
    if (G.phase==='WINNER'){
      const w=G.winner;
      winners.push({name:w.c.name, lasted:w.lasted, dead:G.dead.length, aliveNow:alive().length});
      roundLen.push(w.lasted); roundsDone++;
    }
    pPhase=G.phase; phaseT0=NOW;
  }
  wasRapidClosed = G.rapidLeft>0;

  // --- spoke rotation, unwrapped from the angle the code actually advances ---
  // The denominator must be the time over which the numerator accumulated, nothing else.
  // First version took (last - first) as elapsed, which also counts the WINNER and INTRO
  // phases and the TUMBLE windows - all frames where the angle is deliberately NOT
  // accumulated. That inflated the period to 13.168 s against 12.857, an error of 2.4%,
  // and WINNER+INTRO is 3.1% of wall time: a harness artifact reading as a game bug.
  if ((G.phase==='CLOSED'||G.phase==='OPEN') && G.tumbleT<=0){
    if (spokePrev!==null){
      let d=G.spokeA-spokePrev;
      while(d> Math.PI) d-=2*Math.PI;
      while(d<-Math.PI) d+=2*Math.PI;
      spokeAccum+=d; spokeElapsed+=NOW-spokePrevT;
    }
    spokePrev=G.spokeA; spokePrevT=NOW;
  } else spokePrev=null;

  if (guard%3===0 && G.phase!=='WINNER' && G.phase!=='INTRO') inspect(G);
}

/* ---- report ------------------------------------------------------------ */
spawnSkips += Gref.spawnSkips|0;        // the last draw never hits the swap branch
say('\n--- invariants (pure geometry, no tuning involved) ---');
chk('no NaN in any state', !nanSeen, nanSeen?'NaN detected':'clean');
chk('no ball escapes the rim', maxRimOver<=0.5, `worst excursion ${maxRimOver.toFixed(3)} px`);
// Measured in the reference, NOT assumed: the closed hub is floor, so balls cross it.
// 484 steady-CLOSED frames yielded 50 ball-shaped blobs with centre r < 165 design px
// (43 strictly inside the hub disc), closest 9 design px, in >=10% of frames. That 10% is
// a detection floor - a strict shape/size filter, and a ball over the pinwheel's own dark
// line art can be missed - so the check is one-sided: the sim must cross the hub at least
// as often. A wall model scores exactly 0% and 165 px, and fails this.
const hubFrac = closedFrames ? closedFramesWithBallOnHub/closedFrames : 0;
chk('balls cross the closed hub, as measured', hubFrac>=0.10 && minClosedR<CFG.HUB_R,
    `${(hubFrac*100).toFixed(0)}% of closed frames have a ball over the hub `
    +`(reference >=10%); closest centre ${minClosedR.toFixed(0)} px (reference 9, wall model 165)`);
chk('no ball inside a spoke', maxSpokePen<=1.5, `worst penetration ${maxSpokePen.toFixed(3)} px`
    + (worstPen?`  at ${JSON.stringify(worstPen)}`:''));
chk('ball-ball overlap <= 1 px', maxOverlap<=1.0, `worst overlap ${maxOverlap.toFixed(3)} px`
    + (worstOv?`  at ${JSON.stringify(worstOv)}`:''));
chk('|v| pinned within 0.5%', maxSpeedErr<=0.005, `worst error ${(maxSpeedErr*100).toFixed(4)}%`);
// The opening layout is relaxed, not rejection-sampled (66% packing is above the 54.7% RSA
// jamming limit, so no try budget can succeed). This asserts the relaxation actually landed.
chk('opening layout settles clear', maxSettle<=0.5,
    `worst residual overlap ${maxSettle.toFixed(3)} px over ${ROUNDS} draws at SETTLE=${CFG.SETTLE}`);

const spokePeriod = spokeAccum ? Math.abs(2*Math.PI/(spokeAccum/(spokeElapsed/1000))) : NaN;
chk('spoke revolution 12.86 s in the running sim', Math.abs(spokePeriod-12.857)<0.10,
    `${spokePeriod.toFixed(3)} s over ${(spokeElapsed/1000).toFixed(0)} s of counted rotation`);
chk('spokes turn counter-clockwise', spokeAccum<0, `net ${(spokeAccum*180/Math.PI/360).toFixed(1)} revolutions`);

say('\n--- timing against the reference ---');
chk('median CLOSED phase = 4.13 s (measured)', Math.abs(med(closedDur)/1000-4.13)<0.12,
    `median ${(med(closedDur)/1000).toFixed(3)} s over ${closedDur.length} phases`
    +`  [min ${(Math.min(...closedDur)/1000).toFixed(2)} max ${(Math.max(...closedDur)/1000).toFixed(2)}]`);

const shieldHolds = perOpen.filter(o=>o.n===0).length;
const offQuota = perOpen.filter(o=>o.n !== (o.dbl?2:1) && o.n!==0).length;
chk('one kill per opening (two on a double draw)', offQuota===0,
    `${perOpen.length} openings, ${offQuota} off-quota, ${shieldHolds} shield holds`);
chk('every no-kill opening is a shield hold', shieldHolds<=ev.shield,
    `${shieldHolds} zero-kill openings vs ${ev.shield} shields granted`);
chk('every draw ends 63 eliminated / 1 survivor',
    winners.every(w=>w.aliveNow===1&&w.dead===63), winners.map(w=>`${w.dead}/${w.aliveNow}`).join(' '));

say('\n--- tuning targets (BALL_SPEED / SUCTION are NOT measured) ---');
say(`  open, crowded (>=32 alive): median ${(med(openCrowded)/1000).toFixed(2)} s  n=${openCrowded.length}   REFERENCE 0.97`);
say(`  open, sparse  (<=4 alive) : median ${(med(openSparse)/1000).toFixed(2)} s  mean ${(mean(openSparse)/1000).toFixed(2)} s  n=${openSparse.length}   REFERENCE median 4.25, mean 3.82`);
say(`  open, all                 : median ${(med(openDur)/1000).toFixed(2)}  mean ${(mean(openDur)/1000).toFixed(2)}`);
const cAbs=Math.abs(med(openCrowded)/1000-0.97), sAbs=Math.abs(med(openSparse)/1000-4.25);
chk('crowded open within 0.35 s of reference', cAbs<=0.35, `off by ${cAbs.toFixed(2)} s`);

/* This gate used to compare mean(sparse) against 4.32 s with a 1.8 s tolerance, and it was
   asserting something it could not resolve. sparse_spread.js measured the estimator itself
   over 8 seeds: the per-seed MEAN has sd 4.32 s and a standard error of 4.90 s at the n~6 a
   4-round run produces, because the distribution is bounded below and has a long right tail
   (pooled median 3.90 s, max 61.6 s, mean/median 1.84). A 1.8 s tolerance on a statistic with
   a 4.9 s standard error fails or passes essentially at random - it flagged an 8.89 s reading
   as a regression when that was ordinary sampling noise.

   The per-seed MEDIAN has sd 0.77 s over the same seeds, so it is the statistic that can
   actually be gated. The reference figure was re-derived to match: re-running the gcycle
   phase classification against remaining.json gives, for openings with REMAINING<=4,
   n=6, median 4.25 s, mean 3.82 s. Median vs median, like for like. */
const sMed=med(openSparse)/1000;
chk('sparse open median within 1.5 s of reference', sAbs<=1.5,
    `${sMed.toFixed(2)} s vs 4.25 s, off by ${sAbs.toFixed(2)} s`);

/* The tail is a separate claim from the centre, and it is the one the mean was hiding. In the
   reference, the LONGEST sparse opening in the whole classified window is 5.71 s; openings
   there always resolve promptly. The sim can leave two survivors orbiting without either
   crossing the mouth, which produced a 61.6 s opening - visibly dead air on a live stream,
   and nothing like the source. Gated separately so a centre that looks right cannot excuse a
   tail that does not. 12 s is ~2x the reference max, deliberately loose: this asserts "no
   dead air", not a fitted value. */
const sparseMax = openSparse.length ? Math.max(...openSparse)/1000 : 0;
chk('no stalled opening: sparse tail under 12 s', sparseMax < 12,
    `longest sparse opening ${sparseMax.toFixed(2)} s (reference max 5.71 s)`);

// Independent cross-check: mean inward radial velocity during open.
// This started as a hard third target at -50.6 design px/s (-27 capture px/s) from track.py.
// It has since been DEMOTED to a band, because that figure is not precise enough to
// calibrate against. track.py is the Hough tracker that failed three times on the textured
// arena floor. Re-measuring by a wholly separate route - least-squares dr/dt on tracks over
// the hub disc, which is a clean uniform backdrop - gives -43.6 +- 21.3 design px/s, using
// the CLOSED phase as a known-zero control (it came back +26.4 +- 17.2, i.e. 1.5 sigma from
// zero, so the estimator is honest but noisy). One sigma spans -22 to -65 and two sigma spans
// -1 to -86: consistent with -50.6, but unable to tell it apart from anything the sim can do.
// So: check the sign and the 2-sigma envelope, and let the two open-phase DURATIONS, which
// are measured to a few percent, do the actual calibrating.
const drift = mean(openRadialV);
say(`\n  mean radial velocity while OPEN: ${drift.toFixed(1)} design px/s over ${openRadialN} samples`);
say(`  REFERENCE -43.6 +- 21.3 design px/s (re-measured); track.py's original point estimate -50.6`);
chk('inward drift while open, inside the measured 2-sigma band',
    drift < 0 && drift > -86.2 && drift < -1.0,
    `${drift.toFixed(1)}, band -1.0 to -86.2`);

const totalPlay=roundLen.reduce((a,b)=>a+b,0);
const openRate=openings/(totalPlay/60), elimRate=kills/(totalPlay/60);
say(`\n  openings/min ${openRate.toFixed(2)}   REFERENCE 10.4`);
say(`  eliminations/min ${elimRate.toFixed(2)}   REFERENCE 10.76`);
chk('opening rate within 1.5/min of 10.4', Math.abs(openRate-10.4)<=1.5, `${openRate.toFixed(2)}/min`);
chk('elimination rate within 1.5/min of 10.76', Math.abs(elimRate-10.76)<=1.5, `${elimRate.toFixed(2)}/min`);

say(`\n  round lengths (s): ${roundLen.map(r=>r.toFixed(1)).join('  ')}`);
say(`  REFERENCE rounds 353.8 and 409.9 s`);
chk('every round length in the 300-460 s band', roundLen.every(r=>r>=300&&r<=460),
    `min ${Math.min(...roundLen).toFixed(0)} max ${Math.max(...roundLen).toFixed(0)}`);

const g3=gaps.filter(g=>g<3.0).length;
say(`\n  inter-kill gap: median ${med(gaps).toFixed(2)} s  p5 ${pct(gaps,5).toFixed(2)}  `
  +`${g3} of ${gaps.length} under 3.0 s   REFERENCE median 5.0, zero under 3.0`);
chk('sub-3 s gaps only from declared rare events', g3<=ev.rapid*CFG.RAPID_N+ev.double,
    `${g3} short gaps vs budget ${ev.rapid*CFG.RAPID_N+ev.double}`);

say('\n--- special events (detected from mechanical state) ---');
const rate=k=>(k/openings*100).toFixed(2)+'%';
say(`  openings ${openings} over ${(totalPlay/60).toFixed(1)} min of play`);
say(`  DOUBLE DRAW ${ev.double} (${rate(ev.double)})  configured ${(CFG.P_DOUBLE*100).toFixed(1)}%  MEASURED reference >=1.6%`);
say(`  SHIELD      ${ev.shield} (${rate(ev.shield)})  configured ${(CFG.P_SHIELD*100).toFixed(1)}%  unconfirmed -> rare`);
say(`  TUMBLE      ${ev.tumble} (${rate(ev.tumble)})  configured ${(CFG.P_TUMBLE*100).toFixed(1)}%  unconfirmed -> rare`);
say(`  RAPID FIRE  ${ev.rapid} (${rate(ev.rapid)})  configured ${(CFG.P_RAPID*100).toFixed(1)}%  unconfirmed -> rare`);
say(`  COMEBACK    ${ev.comeback} (${rate(ev.comeback)})  configured ${(CFG.P_COMEBACK*100).toFixed(1)}%  unconfirmed -> rare`);
say(`  comebacks refused for want of a clear spawn: ${spawnSkips}`);
// binomial 3-sigma band on the configured rate: catches a wired-wrong probability
// without failing on ordinary sampling noise.
for (const [name,k,p] of [['DOUBLE',ev.double,CFG.P_DOUBLE],['SHIELD',ev.shield,CFG.P_SHIELD],
                          ['TUMBLE',ev.tumble,CFG.P_TUMBLE],['RAPID',ev.rapid,CFG.P_RAPID]]){
  const mu=openings*p, sd=Math.sqrt(openings*p*(1-p));
  chk(`${name} count inside 3-sigma of its configured rate`, Math.abs(k-mu)<=3*sd+1,
      `${k} observed, expected ${mu.toFixed(1)} +- ${(3*sd).toFixed(1)}`);
}
chk('double-draw configured at or above the reference 1.6% lower bound',
    CFG.P_DOUBLE>=0.016, `${(CFG.P_DOUBLE*100).toFixed(1)}% configured`);

say('\n--- persistence ---');
const wins=JSON.parse(store['cbr_wins']||'{}');
const totalWins=Object.values(wins).reduce((a,b)=>a+b,0);
chk('career wins persisted, one per finished draw', totalWins===roundsDone,
    `${totalWins} wins across ${Object.keys(wins).length} countries, ${roundsDone} draws`);
say('  winners: '+winners.map(w=>w.name).join(', '));

if (QUIET){
  console.log(JSON.stringify({crowded:med(openCrowded)/1000, sparse:mean(openSparse)/1000,
    all:med(openDur)/1000, drift, openRate, elimRate, round:mean(roundLen), fails:fails.length}));
}
say('\n'+'='.repeat(78));
if (fails.length){ say(`${fails.length} FAILED:`); fails.forEach(f=>say('  - '+f)); process.exit(1); }
say('all checks passed'); process.exit(0);
