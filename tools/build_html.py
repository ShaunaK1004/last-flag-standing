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
SCP = "if (p.src==='superchat' && typeof WINART!=='undefined' && WINART) WINART.scPop(p.code, p.user);"
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

# header note about the art files
old_h = 'Drop in audio/loop.mp3 later for a music bed.'
if old_h in src and 'winart/manifest.js' not in src[:4000]:
    src = src.replace(old_h, old_h + '\n\n  WINNER ART: lives in the winart/ folder next to this file (winart/manifest.js +\n'
                      '  one folder per country), loaded on demand. Missing folder = current winner card.', 1)
open(out, 'w', encoding='utf-8').write(src)
print('wrote', out, len(src) // 1024, 'KB')
