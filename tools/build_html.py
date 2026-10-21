#!/usr/bin/env python3
"""Splice tools/src/winart_module.js into the game HTML (replacing the old WINART module) -> index.html.
   usage: python3 tools/build_html.py  <input game html>  [output, default ../index.html]"""
import sys, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
src = open(sys.argv[1], encoding='utf-8').read()
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'index.html')
mod = open(os.path.join(ROOT, 'tools', 'src', 'winart_module.js'), encoding='utf-8').read().rstrip() + '\n'

a = src.index('WINNER ART REVEAL (vertical)'); a = src.rindex('/* ====', 0, a)
b = src.index('/* Expose for the headless verification harness')
src = src[:a] + mod + src[b:]

# render(): when the art covers the whole canvas, skip drawing the arena underneath it
old_r = 'function render(){\n  drawBackdrop();'
new_r = ('function render(){\n'
         '  if (typeof WINART!==\'undefined\' && WINART && WINART.covers()){   // winner art fills the canvas: skip the arena under it\n'
         '    if (G.phase===\'WINNER\' && !WINART.active()) drawWinner();\n'
         '    WINART.overlay(); return;\n'
         '  }\n'
         '  drawBackdrop();')
if old_r in src: src = src.replace(old_r, new_r, 1)
else: assert 'WINART.covers()' in src, 'render() hook not found'

# Winner tab: per-beast sound picker (replaces the single roar file)
a = src.find('<h2>Roar sound</h2>')
if a >= 0:
    b = src.index('<div class="hint" id="waRoarNote"></div>', a) + len('<div class="hint" id="waRoarNote"></div>')
    src = src[:a] + ('''<h2>Beast sounds</h2>
      <div class="seg" id="waRoar"><button data-v="on">On</button><button data-v="off">Off</button></div>
      <label class="blab" style="margin-top:8px">Volume <b id="waVolV"></b><input type="range" id="waVol" min="0" max="1" step="0.05" style="width:100%"></label>
      <label class="blab" style="margin-top:8px">Beast<select class="tin" id="waBeast"></select></label>
      <button class="wide" id="waTest">🔊 Test this beast's sound</button>
      <label class="blab" style="margin-top:10px">Use your own file for this beast (short mp3 / ogg / wav)<input type="file" id="waFile" accept="audio/*"></label>
      <button class="wide" id="waReset">Back to the built-in sound</button>
      <div class="hint" id="waRoarNote"></div>''') + src[b:]

# Winner tab: animation length (full build-up 10 s / quick pop 5 s)
if 'id="waAnim"' not in src: src = src.replace('<button data-v="art">Art reveal (poster)</button></div>',
    '<button data-v="art">Art reveal (poster)</button></div>\n      <div class="seg" id="waAnim" style="margin-top:6px"><button data-v="full">Full build-up · 10 s</button><button data-v="quick">Quick pop + roar · 5 s</button></div>', 1)

# Winner tab: live art status instead of the hard-coded "Art ready for: Russia."
src = re.sub(r'Art ready for: Russia\. Any other winner keeps the current card\.</div>',
             'Countries without art keep the current card.</div>\n      <div class="hint" id="waArt" style="color:#c9d3ff">Loading art list…</div>', src, count=1)

# Winner tab: Super Chat pop (on/off + test)
if 'id="waSc"' not in src:
    k = '<div class="hint" id="waNote">'
    a = src.index(k); b = src.index('</div>', src.index('</div>', a) + 6) + 6
    src = src[:b] + ('\n    <div class="pgroup" data-page="winner">\n      <h2>Super Chat pop</h2>\n'
        '      <div class="hint">When a Super Chat lands, that country\'s card bursts on screen for about 1.2 s with the viewer\'s @handle (no sound), then the game carries on.</div>\n'
        '      <div class="seg" id="waSc"><button data-v="on">On</button><button data-v="off">Off</button><button data-v="test">▶ Test pop</button></div>\n'
        '      <label class="blab" style="margin-top:8px">Test handle<input class="tin" id="waScUser" value="@TestViewer"></label>\n    </div>') + src[b:]
if 'id="waScDur"' not in src:
    k = '<div class="seg" id="waSc">'; a = src.index(k); b = src.index('</div>', a) + 6
    src = src[:b] + '\n      <label class="blab" style="margin-top:8px">Pop length <b id="waScDurV">1.0 s</b><input type="range" id="waScDur" min="1" max="3" step="0.1" value="1" style="width:100%"></label>' + src[b:]
src = src.replace('about 1.2 s with the viewer', 'a moment (1-3 s, slider below) with the viewer')
src = src.replace('<button class="wide" id="waReset">Back to the built-in sound</button>', '<button class="wide" id="waReset">Back to the default sound</button>')

# Super Chat: load the country's art the moment it arrives, burst it when the power lands
old_q = "    if (src==='superchat'){                               // Super Chat = spawn/revive WITH a shield, or shield if alive\n"
if old_q in src and 'WINART.ST.scPop' not in src:
    src = src.replace(old_q, "    if (src==='superchat' && typeof WINART!=='undefined' && WINART && WINART.ST.scPop) WINART.ensure(code);   // art for the Super Chat pop\n" + old_q, 1)
SCP_OLD = "WINART.scPop(p.code, p.user);"
src = src.replace(SCP_OLD, "WINART.scPop(p.code, p.user, false, p.label);")
src = src.replace("if (p.src==='superchat' && typeof WINART!=='undefined' && WINART) WINART.scPop(p.code, p.user, false, p.label);",
                  "if (p.src==='superchat' && !p.noPop && typeof WINART!=='undefined' && WINART) WINART.scPop(p.code, p.user, false, p.label);")
SCP = "if (p.src==='superchat' && !p.noPop && typeof WINART!=='undefined' && WINART) WINART.scPop(p.code, p.user, false, p.label);"
for old in ["LIVECARD.push('🪂 '+c.name+' DROPS IN!', this.cardSub(p)+(nb.shield?' · with shield':''), p.code, '#ffcf3d');",
            "LIVECARD.push((b.shieldHits>1?'🛡×'+b.shieldHits+' ':'🛡 ')+b.c.name+(b.shieldHits>1?' SHIELD ×'+b.shieldHits+'!':' SHIELDED'), this.cardSub(p), p.code, b.shieldCol);",
            "LIVECARD.push('♻ '+b.c.name+' IS BACK!', this.cardSub(p)+(p.withShield?' · with shield':''), p.code, p.withShield?'#ffcf3d':'#5ef2c8');"]:
    if old in src and (old + ' ' + SCP) not in src:
        assert src.count(old) == 1, old[:40]; src = src.replace(old, old + ' ' + SCP, 1)

# ---- never freeze: an error in one frame is logged (console only) and the next frame runs
old_f = """function frame(now){
  let dt=now-last; last=now;
  if (dt>250) dt=250;            // tab was backgrounded: do not fast-forward
  tick(dt);
  render();
  requestAnimationFrame(frame);
}"""
new_f = """let frameErrT=0;
function frameErr(where, e){ const t=performance.now(); if (t-frameErrT>5000){ frameErrT=t; try{ console.warn('frame '+where+' error - skipped, game continues', e); }catch(_){} } }
function frame(now){
  requestAnimationFrame(frame);   // scheduled first: an error in one frame can never freeze the stream
  let dt=now-last; last=now;
  if (dt>250) dt=250;            // tab was backgrounded: do not fast-forward
  try{ tick(dt); }catch(e){ frameErr('tick', e); }
  try{ render(); }catch(e){ frameErr('render', e); try{ for (let i=0;i<64;i++) ctx.restore(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; }catch(_){} }
}"""
if old_f in src: src = src.replace(old_f, new_f, 1)
else: assert 'scheduled first: an error in one frame' in src, 'frame loop not found'

# ---- low-priority special lines: they wait behind every other special line, and a real event drops them
old_s = """  special(text){
    if (!this.enabled || !text) return;
    this.queue = this.queue.filter(q=>q.kind==='special');
    this.queue.push({text, kind:'special'});"""
new_s = """  special(text, low){             // low = support line: waits behind everything, dropped when a real event line arrives
    if (!this.enabled || !text) return;
    this.queue = this.queue.filter(q=>q.kind==='special' && (low || !q.low));
    this.queue.push({text, kind:'special', low:!!low});"""
if old_s in src: src = src.replace(old_s, new_s, 1)
else: assert 'special(text, low)' in src

# ---- the support lines themselves
old_l = """  savedRevive:["Carried-over power! {c}'s revival is ready and waiting!"],
};"""
new_l = """  savedRevive:["Carried-over power! {c}'s revival is ready and waiting!"],
  promoArt:['Every country here has its own champion art. Loved seeing yours? Support the stream with a Super Chat!',
            "Want your country's champion art even more epic? Every Super Chat helps bring new art to the arena!",
            "We're building a unique champion for every nation. Like where it's going? Support it with a Super Chat!",
            'Enjoyed the winner animation? A Super Chat supports the stream, and brings new art for more countries!'],
  promoMember:['Become a channel member and help choose the next champion art. Your vote shapes the arena!',
               'Members decide which countries get new champion art next. Tap Join and cast your vote!',
               'Want a say in the next warrior and beast? Join as a member and vote on the next concept art!',
               "Join the channel and help design what's next. Members vote on every new champion!"],
};"""
if 'promoArt:[' not in src:
    assert src.count(old_l) == 1; src = src.replace(old_l, new_l, 1)

old_p = """  react(kind){ if (this.kind!==kind){ this.kind=kind; this.done={c1:true,c2:true,p:true}; } },
};"""
new_p = old_p + """

/* Support lines - lowest priority of all spoken lines.
   Order of priority: 1) reactions to real viewer events (shield, revive, drop-in, subscriber)
   2) this round's chat / Super Chat / subscribe promo  3) these support lines  4) normal commentary.
   - promoArt: every 2nd round, ~3.5 s after the round starts (after the opening line), only if the last
     winner was shown with its champion art. Window: until 25 s in or 50 countries left, then skipped.
   - promoMember: every 3rd round, mid-round while 45..34 countries are left - the chat / Super Chat /
     subscribe promos only start at 32 left, so they never meet.
   Each one waits until no other special line is queued or speaking; a real event line drops a queued one. */
const PROMO = {
  cfg:{ art:true, member:true }, artDue:false, memDue:false, t0:0,
  load(){ try{ Object.assign(this.cfg, JSON.parse(localStorage.getItem('flagsrumble-promo')||'{}')); }catch(e){} },
  save(){ try{ localStorage.setItem('flagsrumble-promo', JSON.stringify(this.cfg)); }catch(e){} },
  onRound(n){ n=n||1; this.t0=performance.now();
    let art=false; try{ art = typeof WINART!=='undefined' && WINART && WINART.ST.style==='art' && WINART.shownLast(); }catch(e){}
    this.artDue = this.cfg.art && n%2===0 && art; this.memDue = this.cfg.member && n%3===0; },
  free(){ return !COMMENTARY.spBusy(); },
  tick(n){
    if (!LIVE.on || !G || G.phase==='WINNER' || G.phase==='INTRO') return;
    const age=performance.now()-this.t0;
    if (this.artDue){ if (age>25000 || n<50) this.artDue=false; else if (age>3500 && this.free()){ this.artDue=false; this.say('promoArt'); } }
    if (this.memDue){ if (n<34) this.memDue=false; else if (n<=45 && this.free()){ this.memDue=false; this.say('promoMember'); } }
  },
  say(k){ const t=LIVEVOX.pick(k); if (t) COMMENTARY.special(t, true); },
};
PROMO.load();
setTimeout(()=>{ try{
  for (const [id,key] of [['promoArt','art'],['promoMember','member']]){ const el=document.getElementById(id); if (!el) continue;
    const paint=()=>[...el.children].forEach(b=>b.classList.toggle('on', b.dataset.v===String(PROMO.cfg[key])));
    el.addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; PROMO.cfg[key]=b.dataset.v==='true'; PROMO.save(); paint(); }); paint(); }
}catch(e){} }, 0);"""
if 'const PROMO = {' not in src:
    assert src.count(old_p) == 1; src = src.replace(old_p, new_p, 1)

old_t = "    if (G && LIVE.on) LIVESCHED.tick(alive().length);"
if old_t + " try{ if (G && LIVE.on) PROMO.tick(alive().length); }catch(e){}" not in src:
    assert src.count(old_t) == 1; src = src.replace(old_t, old_t + " try{ if (G && LIVE.on) PROMO.tick(alive().length); }catch(e){}", 1)
old_o = "LIVESCHED.onRound(G?G.roundNo:1);"
if "PROMO.onRound(" not in src:
    assert src.count(old_o) == 1; src = src.replace(old_o, old_o + " try{ PROMO.onRound(G?G.roundNo:1); }catch(e){}", 1)

# ---- Live tab: support line switches
if 'id="promoArt"' not in src:
    k = '<div class="pgroup" data-page="live">\n      <h2>Status</h2>'
    assert src.count(k) == 1
    src = src.replace(k, '''<div class="pgroup" data-page="live">
      <h2>Support lines (spoken)</h2>
      <div class="hrow"><span>Champion-art Super Chat line · every 2nd round, at the start</span><div class="seg" id="promoArt"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hrow"><span>Membership line · every 3rd round, mid-round</span><div class="seg" id="promoMember"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hint">Lowest priority: they wait for every other line, a real Super Chat or subscriber always goes first, and a missed slot is simply skipped. Use the membership line only once channel memberships are switched on.</div>
    </div>
    ''' + k, 1)

# ---- popup cards wait while the Super Chat pop covers the screen (so the thank-you card keeps its full time)
old_lc = "  tick(dt){ if (!this.list.length) return; this.list[0].t+=dt;"
if old_lc in src:
    src = src.replace(old_lc, "  tick(dt){ if (!this.list.length) return; try{ if (typeof WINART!=='undefined' && WINART && WINART.scShowing()) return; }catch(e){} this.list[0].t+=dt;", 1)
# ---- spoken reactions name the real event (Jewels / New member / Gift) instead of always "Super Chat"
old_sy = "  say(k, c){ if (!LIVE.on) return false;"
if old_sy in src:
    src = src.replace(old_sy, "  say(k, c, label){ if (!LIVE.on) return false;", 1)
old_sy2 = "if (!t) return false; COMMENTARY.special(t); return true; },"
if old_sy2 in src:
    src = src.replace(old_sy2, "if (!t) return false; const vl={'Jewels':'Jewels','New member':'New member','Gifted memberships':'Gifted membership','Member milestone':'Member'}[label||'']; COMMENTARY.special(vl ? t.replace(/Super Chat/g, vl) : t); return true; },", 1)
old_rx = "    LIVESCHED.react(kind); LIVEVOX.say(key, name);\n"
if old_rx in src:
    src = src.replace(old_rx, "    LIVESCHED.react(kind); LIVEVOX.say(key, name, p.label);\n", 1)
old_ld = "LIVEVOX.say(p.src==='sub'?'rSub':(nb.shield?'rLandShield':'rLand'), c.name);"
if old_ld in src:
    src = src.replace(old_ld, "LIVEVOX.say(p.src==='sub'?'rSub':(nb.shield?'rLandShield':'rLand'), c.name, p.label);", 1)

# ======== Jewels v2: running totals, champion card at every N, country power at P0 / P0+step ... ========
def _once(old, new, marker=None):
    global src
    if (marker or new) in src: return
    assert src.count(old) == 1, ('patch anchor not found', old[:60]); src = src.replace(old, new, 1)

# the champion-card pop is never fired twice for one Jewels gift: power requests from Jewels carry noPop
src = src.replace("if (p.src==='superchat' && typeof WINART!=='undefined' && WINART) WINART.scPop(", "if (p.src==='superchat' && !p.noPop && typeof WINART!=='undefined' && WINART) WINART.scPop(")
_once("      this.pend.push({code, type:'land', withShield, src, user, layers, label:opt.label||''});",
      "      this.pend.push({code, type:'land', withShield, src, user, layers, label:opt.label||'', noPop:!!opt.noPop});")
_once("    this.pend.push({code,type,src,user,saved:!!opt.saved,withShield:!!opt.withShield,layers,label:opt.label||''});",
      "    this.pend.push({code,type,src,user,saved:!!opt.saved,withShield:!!opt.withShield,layers,label:opt.label||'',noPop:!!opt.noPop});")
_once("      this.request(anyCode, w.type, w.src, w.user, {layers:w.layers, land:!this.ball(anyCode), landShield:w.src==='superchat', label:w.label});",
      "      this.request(anyCode, w.type, w.src, w.user, {layers:w.layers, land:!this.ball(anyCode), landShield:w.src==='superchat', label:w.label, noPop:!!w.noPop});")
_once("  add(p){ this.q.push({code:p.code,type:p.type,src:p.src,user:p.user||''});",
      "  add(p){ this.q.push({code:p.code,type:p.type,src:p.src,user:p.user||'',label:p.label||'',noPop:!!p.noPop});")
_once("      this.pend.push({code:s.code, type:t, src:s.src, user:s.user, saved:t==='shield'});",
      "      this.pend.push({code:s.code, type:t, src:s.src, user:s.user, saved:t==='shield', label:s.label||'', noPop:!!s.noPop});")

# Jewels go to their own counter (any phase - a gift during the winner screen still counts)
_once("    this.stats.msgs++;\n    const t = m.t || Date.now();",
      "    this.stats.msgs++;\n    if (m.kind==='jewels'){ try{ JEWELS.ingest(m); }catch(e){ try{ console.warn('jewels', e); }catch(_){} } return; }   // totals, champion card, power\n    const t = m.t || Date.now();")

# spoken thank-you for the Jewels champion card (only ever with the card, never with the small thank-you card)
_once('''  promoArt:[''', '''  jThanks:['Thank you {u} for the Jewels!','Big thanks to {u} for the Jewels!','{u}, thank you so much for the Jewels!'],
  promoArt:[''', "jThanks:[")

# the JEWELS engine, right after PROMO
_once("PROMO.load();", """PROMO.load();

/* Jewels: each viewer's total keeps adding up across rounds (and survives a reload; forgotten after 30 days idle).
   - every gift: one thank-you card per viewer, updated in place while gifts keep coming (no voice)
   - each time the total passes a multiple of POP (default 50): the champion card bursts with the handle + a spoken thank-you
     (country = the one they typed most recently; nobody typed one -> a generic champion card with their handle)
   - country power (shield / comeback / drop-in) at P0 (default 200), then every STEP more (300, 400 ...)
   - one gift = at most one champion card and one power, however big it is */
const JEWELS = {
  cfg:{ pop:50, p0:200, step:100, prog:true }, tally:{}, later:[],
  load(){ try{ const d=JSON.parse(localStorage.getItem('flagsrumble-jewels')||'{}'); Object.assign(this.cfg, d.cfg||{}); this.tally=d.tally||{};
    const old=Date.now()-30*864e5; for (const k in this.tally) if (!this.tally[k] || (this.tally[k].t||0)<old) delete this.tally[k]; }catch(e){} },
  save(){ try{ localStorage.setItem('flagsrumble-jewels', JSON.stringify({cfg:this.cfg, tally:this.tally})); }catch(e){} },
  P(){ return Math.max(10, Math.min(500, this.cfg.pop|0 || 50)); },
  A(){ return Math.max(10, this.cfg.p0|0 || 200); },
  S(){ return Math.max(10, this.cfg.step|0 || 100); },
  value(m){ const n=+m.count || parseInt(String(m.amount||'').replace(/[^0-9]/g,''),10) || 1; return Math.max(1, Math.min(1e6, Math.round(n))); },
  powIdx(x){ const a=this.A(); return x<a ? 0 : 1+Math.floor((x-a)/this.S()); },
  nextPow(x){ const a=this.A(); return x<a ? a : a+this.powIdx(x)*this.S(); },
  spoken(u){ return String(u||'viewer').replace(/^@+/,'').replace(/[_.]+/g,' ').trim() || 'viewer'; },
  ingest(m){
    const C=CHAT, uid=(m.user&&m.user.id)||(m.user&&m.user.name)||'anon', uname=(m.user&&m.user.name)||'viewer', ln=uname.toLowerCase().replace(/^@/,'');
    const pk='jewels|'+ln, prev=C.paidSeen.get(pk), now=Date.now();
    if (prev && prev.via!==(m.via||'') && now-prev.t<90000){ C.note('Same Jewels from '+uname+' via a second source: ignored'); return; }
    C.paidSeen.set(pk,{t:now, via:m.via||''});
    if (m.user&&m.user.id&&m.user.name) C.names.set(ln, m.user.id);
    const clean=chatClean(m.text||''), named=clean ? (chatCountries(clean)[0] || chatCountriesAll(clean)[0]) : null;
    if (named) C.last.set(uid, named);
    const r=this.tally[ln] || (this.tally[ln]={total:0, t:0}), before=r.total, v=this.value(m), P=this.P();
    r.total+=v; r.t=now; this.save();
    const pop = Math.floor(r.total/P) > Math.floor(before/P), power = this.powIdx(r.total) > this.powIdx(before);
    this.card(uname, ln, v, r.total, pop);
    C.note('Jewels from '+uname+': +'+v+' = '+r.total+(pop?' · champion card':'')+(power?' · country power':''));
    if (!pop && !power) return;
    let code=named || C.last.get(uid) || C.last.get(C.names.get(ln)) || null; if (code && !BY_CODE.has(code)) code=null;
    if (power){
      if (code){
        if (G.phase==='WINNER' || G.phase==='INTRO') SAVED.add({code, type:'shield', src:'superchat', user:uname, label:'Jewels', noPop:true});
        else C.request(code, chatIntent(clean)||'shield', 'superchat', uname, {layers:1, land:!C.ball(code), landShield:true, label:'Jewels', noPop:true});
      } else {
        const w={type:'shield', src:'superchat', user:uname, layers:1, label:'Jewels', noPop:true, t:now}; C.await.set(uid,w); C.await.set('n:'+ln,w);
        C.feed.unshift({txt:'💎 '+uname+': name your country!', col:'#7fe3ff', t:0}); if (C.feed.length>3) C.feed.length=3;
      }
    }
    if (pop){ const job={ code, uname, label:(Math.floor(r.total/P)*P)+' Jewels' };
      if (G.phase==='WINNER') this.later.push(job); else this.burst(job); }
  },
  burst(j){
    if (typeof WINART==='undefined' || !WINART) return;
    WINART.scPop(j.code, j.uname, false, j.label, { onStart:()=>{ if (!LIVE.on) return; const t=LIVEVOX.pick('jThanks').replace('{u}', this.spoken(j.uname)); if (t) COMMENTARY.special(t); } });
  },
  onRound(){ const l=this.later.splice(0); l.forEach(j=>{ try{ this.burst(j); }catch(e){} }); },
  card(uname, ln, v, total, pop){                    // one thank-you card per viewer, updated while gifts keep coming
    if (!LIVE.thanks) return;
    const P=this.P(), n=String(uname||'viewer').replace(/^@/,'');
    const prog = !this.cfg.prog ? '' : pop ? ' · 🎉 champion card!' : ' · '+(total%P)+'/'+P+' to champion card';
    const c=LIVECARD.list.find(x=>x.jw===ln && x.t<LIVECARD.DUR-400);
    if (c){ c.jwSum+=v; c.sub='Jewels ×'+c.jwSum+prog; c.t=Math.min(c.t, 600); return; }
    LIVECARD.push('THANK YOU '+n.toUpperCase()+'!', 'Jewels ×'+v+prog, null, '#7fe3ff', '💎', true);
    const k=LIVECARD.list[LIVECARD.list.length-1]; if (k){ k.jw=ln; k.jwSum=v; }
  },
};
JEWELS.load();
setTimeout(()=>{ try{
  const $=id=>document.getElementById(id), J=JEWELS;
  const sl=(id, key, fmt)=>{ const el=$(id), lab=$(id+'V'); if (!el) return; const paint=()=>{ el.value=J.cfg[key]; if (lab) lab.textContent=fmt?fmt(J.cfg[key]):J.cfg[key]; };
    el.addEventListener('input',()=>{ J.cfg[key]=parseInt(el.value,10); J.save(); paint(); }); paint(); };
  sl('jwPop','pop'); sl('jwP0','p0'); sl('jwStep','step');
  const pr=$('jwProg'); if (pr){ const paint=()=>[...pr.children].forEach(b=>b.classList.toggle('on', b.dataset.v===String(J.cfg.prog)));
    pr.addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; J.cfg.prog=b.dataset.v==='true'; J.save(); paint(); }); paint(); }
  const rs=$('jwReset'); if (rs) rs.addEventListener('click',()=>{ J.tally={}; J.save(); });
  setInterval(()=>{ const el=$('jwTop'); if (!el) return; const top=Object.entries(J.tally).sort((a,b)=>b[1].total-a[1].total).slice(0,5);
    el.textContent = top.length ? 'Top: '+top.map(([k,r])=>'@'+k+' '+r.total+' (next card '+(Math.floor(r.total/J.P())+1)*J.P()+', power '+J.nextPow(r.total)+')').join(' · ') : 'No Jewels yet.'; }, 2000);
}catch(e){} }, 0);""", "const JEWELS = {")

# round start: champion cards earned during the winner screen play now
src = src.replace(" try{ PROMO.onRound(G?G.roundNo:1); }catch(e){}\n", " try{ PROMO.onRound(G?G.roundNo:1); }catch(e){} try{ JEWELS.onRound(); }catch(e){}\n", 1) if "JEWELS.onRound()" not in src else src

# right info box: a 5th rule row for Jewels (rows moved closer together)
_once("['🔔','Subscribe','FREE POWER','#b9a4ff']];\n  rows.forEach((r,i)=>{ const y=BY+58+i*27;",
      "['🔔','Subscribe','FREE POWER','#b9a4ff'],['💎',(typeof JEWELS!=='undefined'?JEWELS.A():200)+' Jewels','🛡 / ♻','#7fe3ff']];\n  rows.forEach((r,i)=>{ const y=BY+54+i*23;")
# corner layout footer: alternate the Super Chat tip with the Jewels tip
_once("  const txt=show ? ev.txt : '⭐ Super Chat your country = 🛡 power!';",
      "  const txt=show ? ev.txt : (Math.floor(performance.now()/8000)%2 ? '💎 '+(typeof JEWELS!=='undefined'?JEWELS.A():200)+' Jewels = 🛡 power for your country!' : '⭐ Super Chat your country = 🛡 power!');")

# operator panel: Jewels settings (Live tab), handle position (Winner tab), a 50-Jewels test button
_once('''    <div class="pgroup" data-page="live">
      <h2>Support lines (spoken)</h2>''', '''    <div class="pgroup" data-page="live">
      <h2>Jewels</h2>
      <label class="blab">Champion card every <b id="jwPopV">50</b> Jewels<input type="range" id="jwPop" min="10" max="500" step="10" value="50" style="width:100%"></label>
      <label class="blab">Country power (shield / comeback / drop-in) at <b id="jwP0V">200</b> Jewels<input type="range" id="jwP0" min="50" max="1000" step="10" value="200" style="width:100%"></label>
      <label class="blab">…then again every <b id="jwStepV">100</b> more<input type="range" id="jwStep" min="50" max="500" step="10" value="100" style="width:100%"></label>
      <div class="hrow"><span>Progress on the thank-you card</span><div class="seg" id="jwProg"><button data-v="true">Show</button><button data-v="false">Off</button></div></div>
      <div class="hint">Each viewer's Jewels add up across rounds. One gift never gives more than one champion card and one power, however big. Small gifts get a thank-you card only (merged per viewer, no voice).</div>
      <div class="hint" id="jwTop" style="color:#c9d3ff"></div>
      <button class="wide" id="jwReset">Reset all Jewels totals</button>
    </div>
    <div class="pgroup" data-page="live">
      <h2>Support lines (spoken)</h2>''', 'id="jwPop"')
_once('<label class="blab" style="margin-top:8px">Pop length <b id="waScDurV">',
      '<div class="hrow" style="margin-top:8px"><span>@handle position</span><div class="seg" id="waScTop"><button data-v="top">Upper banner + bottom bar</button><button data-v="bottom">Bottom bar only</button></div></div>\n      <label class="blab" style="margin-top:8px">Pop length <b id="waScDurV">', 'id="waScTop"')
_once('<button id="tJewel">Jewels ×2</button>', '<button id="tJewel">Jewels ×2</button><button id="tJewel50">Jewels ×50</button>', 'id="tJewel50"')
_once("  $('tJewel').addEventListener('click',()=>tEvt('jewels',2));", "  $('tJewel').addEventListener('click',()=>tEvt('jewels',2));\n  $('tJewel50').addEventListener('click',()=>tEvt('jewels',50));", "tEvt('jewels',50)")

# ======== paid event without a country: say what to do (once per viewer per 2 min) ========
_once('''  jThanks:[''', '''  scNoCountry:["Thank you {u}! Now type your country's name or flag in chat, and it jumps into the arena with a shield!",
               "{u}, thanks for the support! Which country is yours? Type its name or flag, and it spawns in with a shield!",
               "Thank you {u}! Your power is waiting. Type your country's name or flag to bring it into the arena!"],
  subNoCountry:["Thanks for subscribing, {u}! Type your country's name or flag in chat to claim your free power!",
                "Welcome, {u}! Type your country's name or flag in chat, and your free power goes to it!"],
  jNeedCountry:["Thank you {u} for the Jewels! Type your country's name or flag in chat to claim its power!",
                "Big thanks, {u}! Your Jewels earned a power. Type your country's name or flag to use it!"],
  jThanks:[''', "scNoCountry:[")
_once("const PROMO = {", """/* a paid event with no country named (now or earlier): tell the viewer what to type - once per viewer per 2 min */
function askCountry(uname, sub){
  try{ if (!LIVE.on) return; const k=String(uname||'').toLowerCase().replace(/^@/,''), now=Date.now(); ASKED.set(k, ASKED.get(k)||0);
    if (now-ASKED.get(k)<120000) return; ASKED.set(k, now);
    const sp=String(uname||'viewer').replace(/^@+/,'').replace(/[_.]+/g,' ').trim()||'viewer', t=LIVEVOX.pick(sub?'subNoCountry':'scNoCountry').replace('{u}', sp);
    if (t) COMMENTARY.special(t); }catch(e){}
}
const ASKED = new Map();
const PROMO = {""", "function askCountry(")
_once("      this.note(label+' from '+uname+': waiting for their next country message');",
      "      this.note(label+' from '+uname+': waiting for their next country message'); askCountry(uname, src==='sub');", "askCountry(uname, src===")
# Super Chat between rounds without a country: keep it waiting into the next round instead of dropping it
_once("    if (!code){ this.note('Super Chat from '+uname+' between rounds: no country found'); return; }",
      "    if (!code){ const w={type:'shield', src:'superchat', user:uname, layers:1, label:'', t:Date.now()}, ln=uname.toLowerCase().replace(/^@/,'');\n      (this.lateAwait||(this.lateAwait=[])).push([uid, w], ['n:'+ln, w]); this.note('Super Chat from '+uname+' between rounds: waiting for their country (next round)'); askCountry(uname, false); return; }")
_once("    this.st.clear(); this.pend.length=0; this.await.clear();",
      "    this.st.clear(); this.pend.length=0; this.await.clear(); if (this.lateAwait){ for (const [k,w] of this.lateAwait) this.await.set(k,w); this.lateAwait=[]; }")
# Jewels: when their champion card plays but the earned power still needs a country, the card's line says so
_once("    if (pop){ const job={ code, uname, label:(Math.floor(r.total/P)*P)+' Jewels' };",
      "    if (pop){ const job={ code, uname, label:(Math.floor(r.total/P)*P)+' Jewels', needCountry: power && !code };", "needCountry: power && !code")
_once("const t=LIVEVOX.pick('jThanks').replace('{u}', this.spoken(j.uname));",
      "const t=LIVEVOX.pick(j.needCountry?'jNeedCountry':'jThanks').replace('{u}', this.spoken(j.uname));", "j.needCountry?'jNeedCountry':'jThanks'")

# two Super Chats before the country is named: both count (shield layers add up)
_once("      const w={type,src,user:uname,layers,label:kind==='superchat'?'':label,t:Date.now()}; this.await.set(uid,w);",
      "      const w={type,src,user:uname,layers,label:kind==='superchat'?'':label,t:Date.now()}; const pw=this.await.get(uid)||this.await.get('n:'+lname); if (pw && pw.src===src && src!=='sub') w.layers=Math.min(5,(pw.layers||1)+layers); this.await.set(uid,w);")

# ======== OBS-safe pickers: OBS's Interact window can't open native <select> lists ========
PICK_JS = r'''<script>
/* OBS-safe pickers. OBS's "Interact" window can't open a native dropdown list, so every <select> in the panel
   is shown as a type-to-search box with its own in-page list instead (the hidden <select> stays the source of truth,
   so all existing code keeps working). Countries match by name, short code (IN, USA, UK), flag emoji or common spelling. */
(function(){
  try{
    const st=document.createElement('style');
    st.textContent='.pk{position:relative;margin-top:3px}.pk .tin{margin-top:0}.pk .pl{position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:60;max-height:260px;overflow:auto;background:#0b1130;border:1px solid #4a5aa8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.55);display:none}'+
      '.pk .pl div{padding:8px 10px;cursor:pointer;color:#dfe6ff;font:600 13px system-ui,sans-serif;border-bottom:1px solid rgba(255,255,255,.05)}.pk .pl div.on,.pk .pl div:hover{background:#2a3a7e}.pk .pl .none{color:#8f9bc8;cursor:default}';
    document.head.appendChild(st);
    const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    function enhance(sel){
      if (!sel || sel.dataset.pk) return; sel.dataset.pk='1';
      const box=document.createElement('div'), inp=document.createElement('input'), list=document.createElement('div');
      box.className='pk'; if (sel.style.flex) box.style.flex=sel.style.flex; box.style.margin=sel.style.margin||'';
      inp.className='tin'; inp.autocomplete='off'; inp.spellcheck=false; list.className='pl';
      box.append(inp, list); sel.insertAdjacentElement('afterend', box); sel.style.display='none';
      let items=[], hi=0, open=false;
      const isCountry=()=>[...sel.options].slice(0,8).every(o=>/^[A-Z]{2}$/.test(o.value));
      inp.placeholder = 'Type to search…';
      const label=()=>{ const o=sel.selectedOptions && sel.selectedOptions[0]; return o ? o.textContent : ''; };
      function refresh(){ try{ sel.dispatchEvent(new Event('focus')); }catch(e){} }
      function find(q){
        const opts=[...sel.options].filter(o=>!o.disabled && o.value!==''); if (!q) return opts;
        const nq=norm(q), up=q.trim().toUpperCase(), seen=new Set(), out=[];
        const add=o=>{ if (o && !seen.has(o.value)){ seen.add(o.value); out.push(o); } };
        if (isCountry()){
          let codes=[]; try{ codes=chatCountriesAll(chatClean(q)); }catch(e){}
          codes.forEach(c=>add(opts.find(o=>o.value===c)));
          add(opts.find(o=>o.value===up));
          const al={UK:'GB',USA:'US',UAE:'AE',KSA:'SA',DRC:'CD'}[up]; if (al) add(opts.find(o=>o.value===al));
        }
        if (!nq) return out.length ? out : opts;                  // only a flag emoji / symbols typed
        opts.filter(o=>norm(o.textContent).startsWith(nq)).forEach(add);
        opts.filter(o=>norm(o.textContent).split(' ').some(w=>w.startsWith(nq))).forEach(add);
        opts.filter(o=>norm(o.textContent).includes(nq)).forEach(add);
        return out;
      }
      function render(){
        list.innerHTML=''; items=find(inp.value===label()?'':inp.value).slice(0,80); if (hi>=items.length) hi=0;
        if (!items.length){ const d=document.createElement('div'); d.className='none'; d.textContent='No match'; list.appendChild(d); }
        items.forEach((o,i)=>{ const d=document.createElement('div'); d.textContent=o.textContent; if (i===hi) d.className='on';
          d.addEventListener('mousedown',e=>{ e.preventDefault(); pick(o.value); }); list.appendChild(d); });
        list.style.display='block'; open=true;
        const on=list.querySelector('.on'); if (on) on.scrollIntoView({block:'nearest'});
      }
      function close(){ list.style.display='none'; open=false; inp.value=label(); }
      function pick(v){ sel.value=v; sel.dispatchEvent(new Event('change',{bubbles:true})); sel.dispatchEvent(new Event('input',{bubbles:true})); close(); inp.blur(); }
      inp.addEventListener('focus',()=>{ refresh(); hi=0; inp.select(); render(); });
      inp.addEventListener('input',()=>{ hi=0; render(); });
      inp.addEventListener('keydown',e=>{
        if (e.key==='ArrowDown'){ hi=Math.min(items.length-1,hi+1); render(); e.preventDefault(); }
        else if (e.key==='ArrowUp'){ hi=Math.max(0,hi-1); render(); e.preventDefault(); }
        else if (e.key==='Enter'){ if (items[hi]) pick(items[hi].value); e.preventDefault(); }
        else if (e.key==='Escape'){ close(); inp.blur(); } });
      inp.addEventListener('blur',()=>setTimeout(()=>{ if (open) close(); },120));
      setInterval(()=>{ if (document.activeElement!==inp) inp.value=label(); }, 600);
      inp.value=label();
    }
    const run=()=>document.querySelectorAll('select').forEach(enhance);
    run(); setTimeout(run, 800); setTimeout(run, 3000);
  }catch(e){ try{ console.warn('pickers', e); }catch(_){} }
})();
</script>
'''
if 'OBS-safe pickers.' in src:
    a_ = src.index('<script>\n/* OBS-safe pickers.'); b_ = src.index('</script>\n', a_) + len('</script>\n'); src = src[:a_] + src[b_:]
i = src.rindex('</body>'); src = src[:i] + PICK_JS + src[i:]

# ======== SMART commentary sequence (default) + classic kept; handle-free spoken lines ========
SMART_JS = r'''/* ===== Spoken promo lines =====
   Live tab -> Support lines -> Commentary sequence:
   CLASSIC: the original plan (chat power on odd rounds; Super Chat on 2 and subscribe on 3 rounds of every 10)
            plus the art line (even rounds) and the membership line (every 3rd round).
   SMART (default) - every round, each ask at most once, in its own slot:
     even rounds, start (+3.5 s) .. champion-art line (only if the last winner was shown with its art)
     45..33 left ................... odd rounds: chat-power shield prompt; every 3rd round: membership line instead
     30..18 left ................... SUBSCRIBE line (rotation; "thanks for the sub" after one came in; "saved for next
                                     round" when the subscriber powers are used up; silent after 2 subs this round)
     16..11 left ................... SUPER CHAT line (rotation incl. a Jewels line; "another one" after a paid event;
                                     silent after 2 paid events this round)
   A line waits for a breath gap (voice idle) so it never cuts across a knockout call; near the end of its slot it is
   queued after the current sentence instead. Real viewer events always go first and drop a queued promo line.
   A missed slot is skipped, never carried over. No line ever speaks a viewer's handle. */
Object.assign(LIVE_LINES, {
  scNoCountry:["Thank you {u} for the Super Chat! Now type your country's name or flag in chat, and it jumps into the arena with a shield!",
               "{u}, thanks for the support! Which country is yours? Type its name or flag in chat, and it spawns in with a shield!",
               "Thank you {u}! Your power is waiting. Type your country's name or flag in chat to bring it into the arena!"],
  jThanks:['Thank you for the Jewels!','Big thanks for the Jewels!','Thank you so much for the Jewels!'],
  jNeedCountry:["Thank you {u} for the Jewels! Type your country's name or flag in chat to claim its power!",
                "Big thanks, {u}! Your Jewels earned a power. Type your country's name or flag to use it!"],
  smartMember:['Join as a channel member: your country gets an instant shield, and you help choose the next champion art!',
               'New members power up their country instantly, and members vote on which nation gets champion art next!',
               'Want a say in the next warrior and beast? Join as a member and vote on the next concept art!'],
  smartSub:["Subscribe, then type your country! Alive? It gets a shield. Out? It comes right back!",
            'New subscribers get a free power! Subscribe and name your country: shield or comeback, instantly!',
            '{N} left! Hit subscribe, type your country, and save it with a free shield or comeback!',
            'Your country not in this round? Subscribe and type its name, and it drops straight in!'],
  smartSubThanks:['Thanks for the new sub! You can too: subscribe, type your country, and get a free power!'],
  smartSubSaved:["Subscribe now, and your country's free power is saved for the next round!"],
  smartSc:['Super Chat your country! Shield if alive, comeback if out, and its champion card pops up with your name!',
           '{N} left! Super Chat your country: instant shield, instant comeback, and your name on its champion card!',
           "Your country's out? Super Chat it, and it's straight back with a shield, with your name on its champion card!",
           'Not playing this round? Super Chat your country, and it drops right in with a shield, and your name!',
           'No limit on Super Chats! Every one powers your country and puts your name on its champion card!',
           "Sending Jewels? Every {J} puts your name on your country's champion card, and {P} Jewels give it a power!"],
  smartScAnother:['Another supporter! Back your country the same way: Super Chat it, and your name goes on its champion card!'],
});
/* a handle as a speakable name for the English voices: "@SamiraJahangir-v9f" -> "Samira Jahangir", "@Rahul_Gaming_99" ->
   "Rahul Gaming 99", "@Tanaka田中" -> "Tanaka". Only Latin letters and digits are kept; nothing readable left
   ("@李小龙", "@😈") -> "" and the line is spoken without a name (the exact handle is still shown on screen). */
function spokenName(u){
  let s=String(u||'').trim().replace(/^@+/,'').replace(/-[a-z0-9]{2,4}$/i,'');              // YouTube's auto suffix (-v9f)
  s=s.replace(/^(x+X+|X+x+)[_.\\-]*/,'').replace(/[_.\\-]*(x+X+|X+x+)$/,'');                // xX_name_Xx decorations
  s=s.replace(/[_.\-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Za-z])(\d)/g,'$1 $2');
  s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if ((s.match(/[A-Za-z]/g)||[]).length<2) return '';
  const w=s.split(' ').filter(Boolean).slice(0,3).join(' '); return w.length>26 ? w.slice(0,26).trim() : w;
}
/* put the name into a line, or take the name slot out cleanly when there is no readable name */
function fillName(t, name){
  t=String(t||''); if (name) return t.replace('{u}', name);
  return t.replace(/^\{u\},\s*(\w)/, (m,c)=>c.toUpperCase()).replace(/,\s*\{u\}/,'').replace(/\s*\{u\}/,'');
}
/* a paid event with no country named (now or earlier): tell them what to type, by name - once per viewer per 2 min.
   Super Chat / Jewels / members only; subscribers are not asked aloud (the on-screen panel still shows it) */
function askCountry(uname, sub, label){
  try{ if (!LIVE.on || sub) return; const k=String(uname||'').toLowerCase().replace(/^@/,''), now=Date.now();
    if (now-(ASKED.get(k)||0)<120000) return; ASKED.set(k, now);
    const vl={'Jewels':'Jewels','New member':'membership','Gifted memberships':'gifted memberships','Member milestone':'membership'}[label||''];
    let t=LIVEVOX.pick('scNoCountry'); if (!t) return; t=fillName(t, spokenName(uname)); if (vl) t=t.replace('the Super Chat', 'the '+vl);
    COMMENTARY.special(t); }catch(e){}
}
const ASKED = new Map();
const PROMO = {
  cfg:{ mode:'smart', art:true, member:true, free:true, sub:true, sc:true }, t0:0, due:{}, ev:{sub:0, paid:0}, rot:{},
  load(){ try{ Object.assign(this.cfg, JSON.parse(localStorage.getItem('flagsrumble-promo')||'{}')); this.rot=JSON.parse(localStorage.getItem('flagsrumble-promo-rot')||'{}')||{}; }catch(e){} },
  save(){ try{ localStorage.setItem('flagsrumble-promo', JSON.stringify(this.cfg)); localStorage.setItem('flagsrumble-promo-rot', JSON.stringify(this.rot)); }catch(e){} },
  smart(){ return this.cfg.mode!=='classic'; },
  onRound(n){ n=n||1; this.t0=performance.now(); this.ev={sub:0, paid:0}; this.round=n; this.done={};
    try{ this.artOK = typeof WINART!=='undefined' && WINART && WINART.ST.style==='art' && WINART.shownLast(); }catch(e){ this.artOK=false; }
    this.plan(); },
  plan(){                                            // re-planned whenever a switch changes; slots already used stay used
    const n=this.round||1, S=this.smart(), dn=this.done||(this.done={});
    this.due={ art: !dn.art && this.cfg.art && n%2===0 && !!this.artOK,
               mid: dn.mid ? null : S ? ((this.cfg.member && n%3===0) ? 'smartMember' : (this.cfg.free && n%2===1 ? 'chat1' : null)) : (this.cfg.member && n%3===0 ? 'promoMember' : null),
               sub: !dn.sub && S && this.cfg.sub, sc: !dn.sc && S && this.cfg.sc };
    this.sig=JSON.stringify(this.cfg); },
  event(kind){ if (kind==='subscribe') this.ev.sub++; else this.ev.paid++; },
  idle(){ return !COMMENTARY.speaking && !COMMENTARY.queue.length; },
  free(){ return !COMMENTARY.spBusy(); },
  tick(n){
    if (!LIVE.on || !G || G.phase==='WINNER' || G.phase==='INTRO') return;
    if (this.sig!==JSON.stringify(this.cfg)) this.plan();
    const age=performance.now()-this.t0, d=this.due, S=this.smart(), dn=this.done;
    const slot=(key, open, gone, force, speak)=>{ if (!d[key] || !open) return; if (gone){ d[key]=false; dn[key]=true; return; }
      if (this.free() && (!S || this.idle() || force)){ const k=d[key]; d[key]=false; dn[key]=true; speak(k); } };
    slot('art', age>3500, age>25000 || n<50, age>12000, ()=>this.say('promoArt'));
    if (S) slot('mid', n<=45, n<33, n<=35, k=>this.say(k));
    else slot('mid', n<=45, n<34, true, k=>this.say(k));
    slot('sub', n<=30, n<18, n<=20, ()=>this.saySub());
    slot('sc', n<=16, n<11, n<=12, ()=>this.saySc());
  },
  saySub(){ if (this.ev.sub>=2) return; if (this.ev.sub===1) return this.say('smartSubThanks');
    let left=1; try{ left=CHAT_RULES.PAID_CAP-CHAT.paid-CHAT.pend.filter(p=>p.src==='sub').length; }catch(e){}
    this.say(left<=0 ? 'smartSubSaved' : 'smartSub', true); },
  saySc(){ if (this.ev.paid>=2) return; this.say(this.ev.paid===1 ? 'smartScAnother' : 'smartSc', true); },
  pick(k, seq){ const a=LIVE_LINES[k]; if (!a||!a.length) return ''; if (!seq) return LIVEVOX.pick(k);
    const i=(this.rot[k]||0)%a.length; this.rot[k]=i+1; this.save(); return a[i]; },
  fill(t){ const cap=s=>s.charAt(0).toUpperCase()+s.slice(1); let sw='thirty'; try{ sw=numWords(CHAT_RULES.SHIELD); }catch(e){}
    if (LIVE.countAll) t=t.replace(/ different messages/g,' messages');
    let J=50, P=200; try{ J=JEWELS.P(); P=JEWELS.A(); }catch(e){}
    return t.replace('{S}',cap(sw)).replace('{s}',sw).replace('{N}', String(alive().length)).replace('{J}', J).replace('{P}', P); },
  say(k, seq){ const t=this.pick(k, seq!==false && /^smart|^promo|^chat1$/.test(k)); if (t) COMMENTARY.special(this.fill(t), true); },
};'''
if 'const PROMO = {' in src:
    a_ = src.index('/* a paid event with no country named') if '/* a paid event with no country named' in src else src.index('const PROMO = {')
    if '/* ===== Spoken promo lines =====' in src: a_ = src.index('/* ===== Spoken promo lines =====')
    b_ = src.index('\nPROMO.load();')
    src = src[:a_] + SMART_JS + src[b_:]
old_w = "  for (const [id,key] of [['promoArt','art'],['promoMember','member']]){ const el=document.getElementById(id); if (!el) continue;\n    const paint=()=>[...el.children].forEach(b=>b.classList.toggle('on', b.dataset.v===String(PROMO.cfg[key])));\n    el.addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; PROMO.cfg[key]=b.dataset.v==='true'; PROMO.save(); paint(); }); paint(); }"
new_w = "  for (const [id,key] of [['promoMode','mode'],['promoArt','art'],['promoMember','member'],['promoFree','free'],['promoSub','sub'],['promoSc','sc']]){ const el=document.getElementById(id); if (!el) continue;\n    const paint=()=>[...el.children].forEach(b=>b.classList.toggle('on', b.dataset.v===String(PROMO.cfg[key])));\n    el.addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; PROMO.cfg[key]= key==='mode' ? b.dataset.v : b.dataset.v==='true'; PROMO.save(); paint(); }); paint(); }"
if old_w in src: src = src.replace(old_w, new_w, 1)
_once("  tick(n){\n    if (!LIVE.on || !G || G.phase==='WINNER' || G.phase==='INTRO') return;\n    if (this.kind==='chat'){",
      "  tick(n){\n    if (!LIVE.on || !G || G.phase==='WINNER' || G.phase==='INTRO') return;\n    if (typeof PROMO!=='undefined' && PROMO.smart()) return;          // SMART sequence: PROMO speaks the promos\n    if (this.kind==='chat'){", "PROMO.smart()) return;")
_once("    this.thank(m, uname);\n    const layers", "    this.thank(m, uname); try{ PROMO.event(kind); }catch(e){}\n    const layers", "try{ PROMO.event(kind); }")
_once("    if (pop){ const job={ code, uname,", "    if (pop){ try{ PROMO.event('jewels'); }catch(e){} const job={ code, uname,", "PROMO.event('jewels')")
# panel
if 'id="promoMode"' not in src:
    a_ = src.index('<h2>Support lines (spoken)</h2>'); b_ = src.index('</div>\n    <div class="pgroup" data-page="live">\n      <h2>Status</h2>', a_)
    src = src[:a_] + '''<h2>Commentary sequence (spoken promos)</h2>
      <div class="seg" id="promoMode"><button data-v="smart">Smart (every round, one ask per slot)</button><button data-v="classic">Classic (original plan)</button></div>
      <div class="hrow" style="margin-top:8px"><span>Champion-art line · even rounds, round start</span><div class="seg" id="promoArt"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hrow"><span>Chat-power prompt · odd rounds, 45→33 left (Smart)</span><div class="seg" id="promoFree"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hrow"><span>Membership line · every 3rd round, mid-round</span><div class="seg" id="promoMember"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hrow"><span>Subscribe line · every round, 30→18 left (Smart)</span><div class="seg" id="promoSub"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hrow"><span>Super Chat line · every round, 16→11 left (Smart)</span><div class="seg" id="promoSc"><button data-v="true">On</button><button data-v="false">Off</button></div></div>
      <div class="hint">Smart: each line waits for a pause in the commentary, a real Super Chat or subscriber always goes first, and after real ones the line becomes a thank-you or stays silent. Use the membership line only once channel memberships are live.</div>
    ''' + src[b_:]

# missing-country lines name the viewer (Super Chat / Jewels / members), with a speakable version of the handle
src = src.replace("askCountry(uname, src==='sub');", "askCountry(uname, src==='sub', label);")
src = src.replace("  spoken(u){ return String(u||'viewer').replace(/^@+/,'').replace(/[_.]+/g,' ').trim() || 'viewer'; },", "  spoken(u){ return spokenName(u); },")
src = src.replace("const t=LIVEVOX.pick(j.needCountry?'jNeedCountry':'jThanks').replace('{u}', this.spoken(j.uname));", "const t=fillName(LIVEVOX.pick(j.needCountry?'jNeedCountry':'jThanks'), this.spoken(j.uname));")

# header note about the art files
old_h = 'Drop in audio/loop.mp3 later for a music bed.'
if old_h in src and 'winart/manifest.js' not in src[:4000]:
    src = src.replace(old_h, old_h + '\n\n  WINNER ART: lives in the winart/ folder next to this file (winart/manifest.js +\n'
                      '  one folder per country), loaded on demand. Missing folder = current winner card.', 1)
open(out, 'w', encoding='utf-8').write(src)
print('wrote', out, len(src) // 1024, 'KB')
