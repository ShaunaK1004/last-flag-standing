/* ==========================================================================
   WINNER ART REVEAL (vertical) - the round winner's own poster art comes alive
   --------------------------------------------------------------------------
   The poster is NOT redrawn: it was cut offline into layers (background plate,
   warrior body, flag cloth, beast, title) + the spots where live numbers go were
   cleared. Here the layers are animated on the 1080x1920 canvas:
     0.2-1.2 s  warrior rises from below into the centre (flag waving)
     1.1-1.9 s  companion beast slides in
     1.9-2.5 s  background, title and HUD frames arrive (title slam + flash)
     2.45-3.4 s ROAR: beast surges + head shake, roar sound, breath, shockwave
     3.4 s ->   eliminated flags pop into the grid; idle motion until the next draw
   Live values drawn in the poster's own layout: COUNTRIES, CYCLE n, LASTED mm:ss,
   CAREER WINS, NEXT DRAW IN n S, every eliminated flag, n / N ELIMINATED.

   ART FILES (v2) - nothing is embedded in this HTML any more
   ----------------------------------------------------------
   winart/manifest.js   lists every country with art (made by tools/winart_pack.py)
   winart/c/<code>/     poster countries: bg, body, flag, beast, title (.webp)
   winart/kits/<kit>/   shared warrior + beast for the long tail; the flag cloth is
                        a shade map the country's own flag is printed onto in code
   winart/bg/           shared backgrounds for kit countries
   A country's images are fetched + decoded off the main thread only when it is in
   the final PREFETCH_AT of a round, and only the last KEEP countries stay decoded
   (older ones are released), so a 24/7 stream does not grow in memory.
   No manifest / a file fails -> that winner simply gets the current card.
   Operator panel -> Winner tab: card style, art status, manual test, roar sound.
   ========================================================================== */
var WINART = (function(){
  const BASE = 'winart/';
  const PREFETCH_AT = 6;          // start loading when this many countries are left
  const KEEP = 8;                 // countries kept decoded (each ~14 MB of bitmaps)
  const WAIT_MS = 1200;           // a winner whose art is still loading waits this long, else current card
  const REFRESH_MS = 10*60*1000;  // re-read the manifest so a new batch goes live without restarting OBS
  const KEY = 'flagsrumble-winart-v1', ROAR_KEY = 'flagsrumble-winart-roar';
  const ST = { style:'art', roar:true, vol:0.9, anim:'full', scPop:true, scDur:1.0, scTop:true };   // scPop: Super Chat burst on/off · scDur: its length, 1-3 s   // anim: 'full' build-up (10 s) | 'quick' pop + roar (5 s)
  try{ Object.assign(ST, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(ST)); }catch(e){} };
  const up = c => String(c||'').toUpperCase();
  const seg = (t,a,b) => Math.max(0, Math.min(1, (t-a)/(b-a)));
  const eo = u => 1-Math.pow(1-Math.max(0,Math.min(1,u)),3);
  const back = u => { u=Math.max(0,Math.min(1,u)); const k=1.5; return 1+(k+1)*Math.pow(u-1,3)+k*Math.pow(u-1,2); };
  const rad = (x,y,r0,r1,stops) => { const g=ctx.createRadialGradient(x,y,r0,x,y,r1); stops.forEach(([o,c])=>g.addColorStop(o,c)); return g; };
  const POP = '"FR Poppins",system-ui,sans-serif';
  const now = () => performance.now();

  /* ---------------- manifest ---------------- */
  let M = null, mStatus = 'loading art list…';
  function readManifest(first){
    const s=document.createElement('script');
    s.src=BASE+'manifest.js'+(location.protocol.startsWith('http') ? '?t='+Date.now() : '');
    s.onload=()=>{ s.remove(); const m=window.WINART_MANIFEST;
      if (m && m.posters){ if (!M || m.updated!==M.updated){ const had=!!M; M=m; mStatus='ok';
          if (had) for (const [c,r] of [...LOADED.entries()]) if (!guard.has(c)){ r.keys.forEach(k=>releaseRes(k, c)); LOADED.delete(c); }   // re-cut art: reload fresh
          paintUi(); } }
      else { mStatus='art list is empty or broken'; paintUi(); } };
    s.onerror=()=>{ s.remove(); if (!M){ mStatus='no winart/manifest.js next to this file - every winner gets the current card'; paintUi(); setTimeout(()=>readManifest(false), 60000); } };
    document.head.appendChild(s);
    void first;
  }
  readManifest(true);
  setInterval(()=>{ if (!preview && !(G && G.phase==='WINNER')) readManifest(false); }, REFRESH_MS);

  // what a country uses: its own poster, or kit + background (test-only kit entries play only from the Winner tab)
  const genName = code => { code=String(code||''); return code.startsWith('~G:') ? code.split(':').slice(2).join(':') : null; };
  function entry(code, forTest){
    if (!M) return null; code=up(code);
    if (code.startsWith('~G:')){ const kn=code.split(':')[1].toLowerCase(), k=M.kits[kn]; return k && k.layout==='B' ? { type:'kitB', e:k, kitName:kn, generic:true } : null; }
    const p=M.posters[code]; if (p) return { type:'poster', e:p };
    const k=M.kitCountries && M.kitCountries[code];
    if (k && (forTest || !k.testOnly) && M.kits[k.kit] && M.kits[k.kit].layout==='B') return { type:'kitB', e:M.kits[k.kit], kitName:k.kit, map:k };
    if (k && (forTest || !k.testOnly) && M.kits[k.kit] && M.bgs[k.bg]) return { type:'kit', e:M.kits[k.kit], bg:M.bgs[k.bg], kitName:k.kit, map:k };
    return null;
  }
  const has = c => !!entry(c, false);
  const hasTest = c => !!entry(c, true);

  /* ---------------- loading, decoding, memory ---------------- */
  // RES: shared decoded resources (files, fades) with the set of countries using them.
  // LOADED: one record per country; the oldest unused ones are released past KEEP.
  const RES = new Map(), LOADED = new Map();
  const HTTP = location.protocol.startsWith('http');
  /* ---- never let the art break the stream: any error -> that art is marked failed, the canvas state is
     restored and the caller falls back (default winner card / no pop / no sound). Logged to the console
     only (at most once per 5 s), never drawn on screen. ---- */
  let errN=0, errLast=0;
  function oops(where, e, code){ errN++; const t=Date.now(); if (t-errLast>5000){ errLast=t; try{ console.warn('winart: skipped '+where+(code?' ('+code+')':''), e); }catch(_){} } }
  function recover(){ try{ for (let i=0;i<64;i++) ctx.restore(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.shadowBlur=0; ctx.shadowColor='rgba(0,0,0,0)'; if ('filter' in ctx) ctx.filter='none'; }catch(_){} }
  function failArt(code){ const r=code && LOADED.get(code); if (r){ try{ r.keys.forEach(k=>releaseRes(k, code)); }catch(_){} r.keys=[]; r.pack=null; r.state='fail'; r.at=now(); } }
  const safe = (fn, dflt, where) => function(){ try{ return fn.apply(null, arguments); }catch(e){ oops(where||'call', e); return dflt; } };
  function decodeFile(path){
    if (HTTP && window.createImageBitmap) return fetch(BASE+path).then(r=>{ if (!r.ok) throw new Error(r.status+' '+path); return r.blob(); }).then(b=>createImageBitmap(b));
    // opened as a local file (double-click): Chrome blocks reading pixels of local images, so the art comes
    // from winart-local/<path>.js (same pictures as data URLs, made by tools/winart_local.py, never deployed)
    return localSrc(path).then(src=>new Promise((res,rej)=>{ const im=new Image(); im.decoding='async'; im.onload=()=>{ (im.decode?im.decode():Promise.resolve()).then(()=>res(window.createImageBitmap?createImageBitmap(im):im)).catch(()=>res(im)); }; im.onerror=()=>rej(new Error('missing '+path)); im.src=src; }));
  }
  function localSrc(path){
    if (HTTP) return Promise.resolve(BASE+path);
    const L = window.WINART_LOCAL = window.WINART_LOCAL || {};
    if (L[path]) return Promise.resolve(L[path]);
    return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='winart-local/'+path+'.js';
      s.onload=()=>{ s.remove(); L[path] ? res(L[path]) : rej(new Error('local pack empty '+path)); };
      s.onerror=()=>{ s.remove(); rej(new Error('missing winart-local/'+path+'.js (run tools/winart_local.py, or open the site over http)')); };
      document.head.appendChild(s); });
  }
  function getRes(key, code, make){
    let r=RES.get(key); if (!r){ r={ refs:new Set(), val:null, p:null }; r.p=make().then(v=>(r.val=v)); RES.set(key, r); }
    r.refs.add(code); return r.p;
  }
  function releaseRes(key, code){
    const r=RES.get(key); if (!r) return; r.refs.delete(code);
    if (!r.refs.size){ RES.delete(key); if (r.val && r.val.close) try{ r.val.close(); }catch(e){} }
  }
  const toBitmap = c => window.createImageBitmap ? createImageBitmap(c).catch(()=>c) : Promise.resolve(c);
  function canvas(w,h){ const c=document.createElement('canvas'); c.width=Math.max(1,Math.ceil(w)); c.height=Math.max(1,Math.ceil(h)); return c; }
  function makeFade(bmp, L, y0, y1){        // lower edge faded out (used only while standing on the dark stage)
    const c=canvas(L.w,L.h), g=c.getContext('2d'); g.drawImage(bmp,0,0,L.w,L.h);
    g.globalCompositeOperation='destination-out'; const gr=g.createLinearGradient(0,y0-L.y,0,y1-L.y);
    gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(0,0,0,1)'); g.fillStyle=gr; g.fillRect(0,0,L.w,L.h);
    return toBitmap(c);
  }
  function flagSource(code){                // the country's real flag art (640x480), else the procedural painter
    if (genName(code)!=null){ const w=canvas(640,480), g=w.getContext('2d'); g.fillStyle='#f4f4f2'; g.fillRect(0,0,640,480); return w; }   // generic card: plain white flag
    const fi=(typeof FLAG_IMG!=='undefined') && FLAG_IMG[code.toLowerCase()]; if (fi) return fi;
    const c=BY_CODE.get(code), cv=canvas(640,480); if (c && c.ops) paintFlag(cv.getContext('2d'), c.ops, 640, 480); return cv;
  }
  function makeKitFlag(kit, shade, code, over){   // print the country flag (or the clan banner) onto the kit's cloth: follows the cloth top/bottom per column
    const L=kit.layers.flag, st=kit.flagColStep||4, cols=kit.flagCols, src=over||flagSource(code), sw=src.width||640, sh=src.height||480;
    const c=canvas(L.w,L.h), g=c.getContext('2d'); g.imageSmoothingQuality='high';
    g.drawImage(src, 0,0,sw,sh, 0,0,L.w,L.h);
    for (let x=0;x<L.w;x+=1){                // 1 px columns, cloth edges interpolated between the samples (no stair-steps)
      const f=Math.min(cols.length-1.001, x/st), i=Math.floor(f), u=f-i, j=Math.min(cols.length-1,i+1);
      const t=cols[i][0]+(cols[j][0]-cols[i][0])*u-L.y, b=cols[i][1]+(cols[j][1]-cols[i][1])*u-L.y;
      g.drawImage(src, x/L.w*sw, 0, sw/L.w, sh, x, t, 1.6, Math.max(4,b-t)); }
    g.globalCompositeOperation='hard-light'; g.drawImage(shade,0,0,L.w,L.h);     // 50% grey = untouched, darker = folds, lighter = sheen
    g.globalCompositeOperation='destination-in'; g.drawImage(shade,0,0,L.w,L.h);  // cut to the cloth shape
    return toBitmap(c);
  }
  function makeKitTitle(kit, plate, code){  // kit title: country flag ball + the plate (crown, wings, SURVIVES) + the name
    const T=kit.title, L=kit.layers.plate || {x:119,y:760,w:677,h:454};
    const c=canvas(L.w,L.h), g=c.getContext('2d'); g.translate(-L.x,-L.y);
    const sp=sprites.get(code), [bx,by,br]=T.ball;
    if (sp){ g.save(); g.beginPath(); g.arc(bx,by,br,0,7); g.clip(); g.drawImage(sp,bx-br,by-br,2*br,2*br); g.restore(); }
    if (plate) g.drawImage(plate, L.x, L.y, L.w, L.h);
    const c0=BY_CODE.get(code), name=String((c0&&c0.name)||code).toUpperCase(), [nx,ny,maxW,size0]=T.name;
    const FONT='"FR Bungee",Impact,system-ui,sans-serif';
    g.font=size0+'px '+FONT; let w=g.measureText(name).width, size=size0, sx=1;
    if (w>maxW){ size=Math.max(46, size0*maxW/w); g.font=size+'px '+FONT; w=g.measureText(name).width; if (w>maxW) sx=maxW/w; }
    g.save(); g.translate(nx,ny); g.scale(sx,1); g.textAlign='center'; g.textBaseline='middle'; g.lineJoin='round';
    g.shadowColor='rgba(0,0,0,.75)'; g.shadowBlur=14; g.shadowOffsetY=5;
    g.lineWidth=size*0.16; g.strokeStyle='#1b1206'; g.strokeText(name,0,0); g.shadowColor='transparent';
    const gr=g.createLinearGradient(0,-size*0.55,0,size*0.5);
    [[0,'#ffffff'],[0.32,'#e3e7ef'],[0.5,'#8d96a8'],[0.56,'#c9cfdb'],[0.8,'#f6f8fc'],[1,'#a7afbf']].forEach(([o,cc])=>gr.addColorStop(o,cc));
    g.fillStyle=gr; g.fillText(name,0,0);
    g.lineWidth=Math.max(2,size*0.035); g.strokeStyle='#d6a640'; g.strokeText(name,0,0);
    g.restore();
    return toBitmap(c);
  }
  function readWeights(bmp){                 // weight map (1 = moves with the beast, 0 = pinned) -> Float32 grid
    const w=bmp.width, h=bmp.height, c=canvas(w,h), g=c.getContext('2d'); g.drawImage(bmp,0,0);
    const d=g.getImageData(0,0,w,h).data, a=new Float32Array(w*h); for (let i=0;i<w*h;i++) a[i]=d[i*4]/255; return { a, w, h };
  }
  /* The beast is not a cut-out: a patch of the poster around it is bent with a smooth displacement field
     (WebGL mesh). Deep inside the beast it moves rigidly (surge / turn / wing beat); towards the patch edge and
     wherever it touches the warrior, flag or title it eases to zero, so no edge ever opens and nothing behind
     it is uncovered. No WebGL -> the beast simply stays still (it is part of the background plate). */
  const WARP = (function(){
    let cv=null, gl=null, prog=null, buf=null, tex=null, cur=null, n=0, L={}, dead=false;
    const VS=`attribute vec2 aP; attribute float aW; uniform vec2 uSize,uPiv,uOff; uniform float uK,uRot,uFlap,uAx,uHalf; varying vec2 vT;
      void main(){ vT=aP/uSize; vec2 d=aP-uPiv; float c=cos(uRot), s=sin(uRot);
        vec2 q=uPiv+uK*vec2(c*d.x-s*d.y, s*d.x+c*d.y)+uOff; float r=abs(aP.x-uAx)/uHalf; q.y-=uFlap*pow(max(0.0,(r-0.18)/0.82),1.35);
        vec2 p=aP+aW*(q-aP); vec2 cl=p/uSize*2.0-1.0; gl_Position=vec4(cl.x,-cl.y,0.0,1.0); }`;
    const FS=`precision mediump float; uniform sampler2D uTex; varying vec2 vT; void main(){ gl_FragColor=texture2D(uTex,vT); }`;
    function init(){
      if (gl || dead) return !!gl;
      try{
        cv=document.createElement('canvas'); gl=cv.getContext('webgl',{premultipliedAlpha:true, preserveDrawingBuffer:true, antialias:false, alpha:true});
        if (!gl) throw 0;
        cv.addEventListener('webglcontextlost', e=>{ e.preventDefault(); cur=null; }, false);
        cv.addEventListener('webglcontextrestored', ()=>{ gl=null; cv=null; cur=null; }, false);   // rebuilt on the next draw
        const sh=(t,src)=>{ const o=gl.createShader(t); gl.shaderSource(o,src); gl.compileShader(o); if (!gl.getShaderParameter(o,gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
        prog=gl.createProgram(); gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw 'link';
        gl.useProgram(prog); ['uSize','uPiv','uOff','uK','uRot','uFlap','uAx','uHalf','uTex'].forEach(k=>L[k]=gl.getUniformLocation(prog,k));
        L.aP=gl.getAttribLocation(prog,'aP'); L.aW=gl.getAttribLocation(prog,'aW'); buf=gl.createBuffer(); tex=gl.createTexture();
        return true;
      }catch(e){ console.warn('winart warp: no WebGL, beast stays still', e); dead=true; gl=null; return false; }
    }
    function setup(P){                           // mesh + texture for this card (once per card)
      if (cur===P) return; cur=P;
      const Lw=P.L.warp, S=Math.min(2, W/P.w), wg=P.wgt, step=8;
      cv.width=Math.ceil(Lw.w*S); cv.height=Math.ceil(Lw.h*S); gl.viewport(0,0,cv.width,cv.height);
      const nx=Math.ceil(Lw.w/step)+1, ny=Math.ceil(Lw.h/step)+1, X=i=>Math.min(Lw.w,i*step), Y=j=>Math.min(Lw.h,j*step);
      const wAt=(x,y)=>{ const fx=Math.max(0,Math.min(wg.w-1.001,x/4-0.5)), fy=Math.max(0,Math.min(wg.h-1.001,y/4-0.5)), i=fx|0, j=fy|0, u=fx-i, v=fy-j, a=wg.a, W2=wg.w;
        return (a[j*W2+i]*(1-u)+a[j*W2+i+1]*u)*(1-v)+(a[(j+1)*W2+i]*(1-u)+a[(j+1)*W2+i+1]*u)*v; };
      const V=[]; const vert=(i,j)=>{ const x=X(i), y=Y(j); V.push(x,y,wAt(x,y)); };
      for (let j=0;j<ny-1;j++) for (let i=0;i<nx-1;i++){ vert(i,j); vert(i+1,j); vert(i,j+1); vert(i+1,j); vert(i+1,j+1); vert(i,j+1); }
      n=V.length/3; gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);
      const c=canvas(Lw.w,Lw.h); c.getContext('2d').drawImage(P.I.warp,0,0,Lw.w,Lw.h);
      gl.bindTexture(gl.TEXTURE_2D,tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
      [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE));
      [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR));
    }
    function draw(P, pose){ try{ return draw0(P, pose); }catch(e){ oops('roar motion', e); cur=null; return false; } }
    function draw0(P, pose){                      // returns false when it cannot draw
      if (!P.I.warp || !P.wgt || !init()) return false;
      if (gl.isContextLost && gl.isContextLost()) return false;
      setup(P);
      const Lw=P.L.warp, Lb=P.L.beast, [ax,ay]=P.an.beastPivot, half=Math.max(ax-Lb.x, Lb.x+Lb.w-ax);
      gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.enableVertexAttribArray(L.aP); gl.vertexAttribPointer(L.aP,2,gl.FLOAT,false,12,0);
      gl.enableVertexAttribArray(L.aW); gl.vertexAttribPointer(L.aW,1,gl.FLOAT,false,12,8);
      gl.uniform2f(L.uSize,Lw.w,Lw.h); gl.uniform2f(L.uPiv,ax-Lw.x,ay-Lw.y); gl.uniform2f(L.uOff,pose.dx,pose.dy);
      gl.uniform1f(L.uK,pose.k); gl.uniform1f(L.uRot,pose.rot); gl.uniform1f(L.uFlap,P.cls==='bird'?pose.flap:0); gl.uniform1f(L.uAx,ax-Lw.x); gl.uniform1f(L.uHalf,half);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex); gl.uniform1i(L.uTex,0);
      gl.disable(gl.BLEND); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES,0,n);
      ctx.drawImage(cv, Lw.x, Lw.y, Lw.w, Lw.h); return true;
    }
    return { draw, ok:()=>init() };
  })();
  /* ---- layout-B kits: one warrior + beast poster with a white flag, an empty white ball and an empty name band.
     Per country: the real flag is printed onto the cloth (folds kept), into the ball (gloss kept) and the name is
     written into the band in Cinzel (silver, gold edge), shrunk to fit. ---- */
  let cinzel=null;
  function nameFont(){
    if (cinzel) return cinzel;
    const src = window.WINART_EMBED && window.WINART_EMBED.font ? window.WINART_EMBED.font : BASE+'fonts/cinzel-900.woff2';
    const srcP = (window.WINART_EMBED && window.WINART_EMBED.font) ? Promise.resolve(src) : localSrc('fonts/cinzel-900.woff2');
    cinzel = (window.FontFace ? srcP.then(s=>new FontFace('WA Cinzel', 'url('+s+')', { weight:'900' }).load()).then(f=>{ document.fonts.add(f); return true; }) : Promise.resolve(false)).catch(()=>false);
    return cinzel;
  }
  function makeKitTitleB(kit, title, code, over){
    const L=kit.layers.title, c=canvas(L.w,L.h), g=c.getContext('2d'); g.drawImage(title,0,0,L.w,L.h);
    const [bx,by,br]=kit.ball, cx=bx-L.x, cy=by-L.y, src=over||flagSource(code), sw=src.width||640, sh=src.height||480;
    // ball: flag (cover-fit) multiplied onto the white glossy ball, then a soft highlight back on top
    const b=canvas(2*br+2,2*br+2), bg2=b.getContext('2d'), hh=2*br, ww=hh*sw/sh;
    bg2.save(); bg2.beginPath(); bg2.arc(br+1,br+1,br,0,7); bg2.clip();
    bg2.drawImage(src, br+1-ww/2, 1, ww, hh);
    bg2.globalCompositeOperation='multiply'; bg2.drawImage(c, cx-br-1, cy-br-1, 2*br+2, 2*br+2, 0, 0, 2*br+2, 2*br+2);
    bg2.globalCompositeOperation='screen'; const hl=bg2.createRadialGradient(br*0.62,br*0.5,0,br*0.62,br*0.5,br*0.95);
    hl.addColorStop(0,'rgba(255,255,255,.55)'); hl.addColorStop(0.35,'rgba(255,255,255,.12)'); hl.addColorStop(1,'rgba(255,255,255,0)'); bg2.fillStyle=hl; bg2.fillRect(0,0,2*br+2,2*br+2);
    bg2.globalCompositeOperation='source-over'; const rim=bg2.createRadialGradient(br+1,br+1,br*0.72,br+1,br+1,br);
    rim.addColorStop(0,'rgba(0,0,0,0)'); rim.addColorStop(1,'rgba(0,0,0,.32)'); bg2.fillStyle=rim; bg2.fillRect(0,0,2*br+2,2*br+2);
    bg2.restore(); if (genName(code)==null || over) g.drawImage(b, cx-br-1, cy-br-1);
    // name in the dark band
    const [x0,y0,x1,y1]=kit.band, c0=BY_CODE.get(code), name=String(genName(code)!=null ? genName(code).replace(/^@+/,'') : ((c0&&c0.name)||code)).toUpperCase();   // Cinzel has no clean @
    const bw=(x1-x0)*0.9, bh=(y1-y0), mx=(x0+x1)/2-L.x, my=(y0+y1)/2-L.y+bh*0.04, FONT='"WA Cinzel","Cinzel",Georgia,serif';
    let size=bh*0.78; g.font='900 '+size+'px '+FONT; let w=g.measureText(name).width, sx=1;
    if (w>bw){ size=Math.max(bh*0.46, size*bw/w); g.font='900 '+size+'px '+FONT; w=g.measureText(name).width; if (w>bw) sx=bw/w; }
    g.save(); g.translate(mx,my); g.scale(sx,1); g.textAlign='center'; g.textBaseline='middle'; g.lineJoin='round';
    g.shadowColor='rgba(0,0,0,.8)'; g.shadowBlur=size*0.18; g.shadowOffsetY=size*0.06;
    g.lineWidth=size*0.13; g.strokeStyle='#120c04'; g.strokeText(name,0,0); g.shadowColor='transparent';
    const gr=g.createLinearGradient(0,-size*0.5,0,size*0.45);
    [[0,'#ffffff'],[0.35,'#e6e9f0'],[0.52,'#8f97a8'],[0.6,'#cfd5e0'],[0.85,'#f7f9fc'],[1,'#aab2c2']].forEach(([o,cc])=>gr.addColorStop(o,cc));
    g.fillStyle=gr; g.fillText(name,0,0); g.lineWidth=Math.max(1.5,size*0.03); g.strokeStyle='#e0b453'; g.strokeText(name,0,0);
    g.restore();
    return toBitmap(c);
  }
  function ensure(code, forTest){             // start loading (no-op if loaded / loading / failed recently)
    code=up(code); const en=entry(code, forTest); if (!en) return null;
    let rec=LOADED.get(code);
    if (rec && rec.state==='loading' && now()-rec.at>20000){ oops('loading (timed out)', '', code); rec.keys.forEach(k=>releaseRes(k, code)); LOADED.delete(code); rec=null; }   // stuck download: start again
    if (rec && rec.state==='fail' && now()-rec.at<60000) return rec;
    if (rec && rec.state!=='fail'){ rec.t=now(); return rec; }
    rec={ state:'loading', t:now(), at:now(), keys:[], pack:null, en }; LOADED.set(code, rec);
    const need=(key, make) => { rec.keys.push(key); return getRes(key, code, make); };
    const file = path => need(path, ()=>decodeFile(path));
    const e=en.e, Ls=e.layers, fd=e.fade||{};
    let job;
    if (en.type==='poster'){
      job=Promise.all(['bg','body','flag','beast','title'].map(k=>file(Ls[k].f))).then(([bg,body,flag,beast,title])=>
        Promise.all([ need(Ls.body.f+'#fade', ()=>makeFade(body, Ls.body, ...(fd.body||[720,832]))), need(Ls.beast.f+'#fade', ()=>makeFade(beast, Ls.beast, ...(fd.beast||[590,760]))) ])
          .then(([bodyFade, beastFade])=>({ I:{bg,body,bodyFade,flag,beast,beastFade,title}, L:{...Ls, bodyFade:Ls.body, beastFade:Ls.beast} })))
        .then(pk=>(Ls.warp && Ls.wmap) ? Promise.all([file(Ls.warp.f), file(Ls.wmap.f)]).then(([warp,wmap])=>{ pk.I.warp=warp; pk.wgt=readWeights(wmap); return pk; }) : pk);
    } else if (en.type==='kitB'){
      const clanP = en.generic && e.clan ? file(e.clan.f).catch(()=>null) : Promise.resolve(null);   // generic card: the kit's clan banner
      job=Promise.all(['bg','body','flag','beast','title','warp','wmap'].map(k=>file(Ls[k].f)).concat([nameFont(), clanP])).then(([bg,body,shade,beast,title,warp,wmap,font,clan])=>
        Promise.all([ need(Ls.body.f+'#fade', ()=>makeFade(body, Ls.body, ...(fd.body||[720,832]))), need(Ls.beast.f+'#fade', ()=>makeFade(beast, Ls.beast, ...(fd.beast||[590,760]))),
                      need('kitflag:'+code+':'+en.kitName, ()=>makeKitFlag(e, shade, code, clan)), need('kittitle:'+code+':'+en.kitName, ()=>makeKitTitleB(e, title, code, clan)) ])
          .then(([bodyFade, beastFade, flag, ttl])=>({ I:{bg,body,bodyFade,flag,beast,beastFade,title:ttl,warp}, wgt:readWeights(wmap), L:{...Ls, bodyFade:Ls.body, beastFade:Ls.beast} })));
    } else {
      const plateP = Ls.plate ? file(Ls.plate.f) : Promise.resolve(null);
      job=Promise.all([file(en.bg.f), file(Ls.body.f), file(Ls.beast.f), file(Ls.flag.f), plateP, (document.fonts&&document.fonts.load ? document.fonts.load('400 40px "FR Bungee"').catch(()=>0) : 0)])
        .then(([bg,body,beast,shade,plate])=>Promise.all([
          need(Ls.body.f+'#fade', ()=>makeFade(body, Ls.body, ...(fd.body||[720,832]))),
          need(Ls.beast.f+'#fade', ()=>makeFade(beast, Ls.beast, ...(fd.beast||[590,760]))),
          need('kitflag:'+code+':'+en.kitName, ()=>makeKitFlag(e, shade, code)),
          need('kittitle:'+code+':'+en.kitName, ()=>makeKitTitle(e, plate, code)) ])
        .then(([bodyFade, beastFade, flag, title])=>({ I:{bg,body,bodyFade,flag,beast,beastFade,title},
          L:{ bg:{x:0,y:0,w:941,h:1672}, body:Ls.body, bodyFade:Ls.body, beast:Ls.beast, beastFade:Ls.beast, flag:Ls.flag, title:Ls.plate||{x:119,y:760,w:677,h:454} } })));
    }
    job.then(p=>{ if (LOADED.get(code)!==rec) return;
        const B=e.layout==='B';
        rec.pack={ ...p, hb:e.hb||null, w:e.w||941, h:e.h||1672, an:e.anchors, grid:B?null:(e.grid||M.layout.grid), text:e.text||M.layout.text, beast:e.beast||'bear',
                   B, cls:e.cls||'cat', fx:e.fx||'mist', color:e.color||'#ffd27a', amb:e.amb||'embers', petal:e.petal||'#ffb6d0', dir:e.dir||-1 };
        rec.state='ready'; rec.warm=false; trim(); paintUi(); })
      .catch(err=>{ console.warn('winart', code, err); if (LOADED.get(code)!==rec) return; rec.keys.forEach(k=>releaseRes(k, code)); rec.keys=[]; rec.state='fail'; rec.at=now(); paintUi(); });
    trim(); return rec;
  }
  let guard = new Set();                       // never released: on screen now or about to be
  function trim(){
    if (LOADED.size<=KEEP) return;
    const old=[...LOADED.entries()].filter(([c,r])=>!guard.has(c) && r.state!=='loading').sort((a,b)=>a[1].t-b[1].t);
    while (LOADED.size>KEEP && old.length){ const [c,r]=old.shift(); r.keys.forEach(k=>releaseRes(k, c)); LOADED.delete(c); }
  }
  const pack = c => { const r=LOADED.get(up(c)); if (r && r.state==='ready'){ r.t=now(); return r.pack; } return null; };
  const ready = c => !!pack(c);
  const use = c => ST.style==='art' && has(c) && ready(c);
  function warm(P){                            // push every bitmap to the GPU once, invisibly, before it is needed
    ctx.save(); ctx.globalAlpha=0.004; for (const im of Object.values(P.I)) if (im) ctx.drawImage(im, 0, 0, 1, 1); ctx.restore();
  }
  let lastScan=0;
  function scan(){                             // final few of the round -> load their art now
    const t=now(); if (t-lastScan<300) return; lastScan=t;
    const g=new Set(); if (show && show.code) g.add(show.code); if (preview) g.add(preview.code); if (scCur) g.add(scCur.code); for (const q of scQ) g.add(q.code);
    if (M && ST.style==='art' && G && G.balls && G.phase!=='WINNER'){ const al=alive(); if (al.length<=PREFETCH_AT) for (const b of al){ g.add(b.c.code); ensure(b.c.code); } }
    guard=g;
    for (const r of LOADED.values()) if (r.state==='ready' && !r.warm){ r.warm=true; warm(r.pack); break; }
  }

  /* ---------------- beast sounds: your own file per beast (IndexedDB), otherwise a built-in synth ---------------- */
  const BEASTS = ['lion','tiger','jaguar','leopard','haetae','wolf','bull','moose','elephant','eagle','falcon','condor','garuda','dragon','bear'];
  const BEAST_NAME = { lion:'Lion — lion roar', tiger:'Tiger — tiger roar', jaguar:'Jaguar — tiger roar, higher', leopard:'Snow leopard — tiger roar, higher',
    haetae:'Haetae — tiger roar, deeper', wolf:'Wolf — tiger roar, sharper', bull:'Bull — built-in bellow', moose:'Moose — bear roar, deeper', elephant:'Elephant — trumpet', condor:'Condor — eagle cry, deeper', eagle:'Eagle — scream', falcon:'Falcon — eagle cry', garuda:'Garuda — eagle scream, deeper', dragon:'Dragon — built-in roar + fire', bear:'Bear — bear roar' };
  /* default sounds: real recordings in winart/sfx/ (loudness-matched). [file, playback rate]: a slightly faster or
     slower rate gives the beasts that share a recording their own size. Dragon + bull keep the built-in synth. */
  const SFX_DEF = { lion:['lion',1], tiger:['tiger',1], jaguar:['tiger',1.1], leopard:['tiger',1.16], haetae:['tiger',0.88], wolf:['tiger',1.22],
    bear:['bear',1], moose:['bear',0.8], elephant:['elephant',1], eagle:['eagle-scream',1], falcon:['eagle-cry',1.08], condor:['eagle-cry',0.86], garuda:['eagle-scream',0.8] };
  const SFXBUF = {};                                   // file -> { buf } decoded once
  function sfxLoad(name){
    if (SFXBUF[name]) return; let a=null;                // decode with an offline context: no audio device is opened before the first click
    try{ const O=window.OfflineAudioContext||window.webkitOfflineAudioContext; a=O ? new O(2, 1, 44100) : ac(); }catch(e){ a=null; }
    if (!a) return; const e=SFXBUF[name]={ buf:null };
    localSrc('sfx/'+name+'.mp3').then(src=>fetch(src)).then(r=>{ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(x=>a.decodeAudioData(x)).then(b=>{ e.buf=b; }).catch(()=>{ e.bad=true; setTimeout(()=>{ if (SFXBUF[name]===e) delete SFXBUF[name]; }, 60000); });
  }
  setTimeout(()=>{ if (typeof window!=='undefined' && !window.WINART_EMBED) [...new Set(Object.values(SFX_DEF).map(d=>d[0]))].forEach(sfxLoad); }, 1500);
  const CUSTOM = {};                                   // beast -> { src, buf }
  const AKEY = b => 'winart-roar:'+b;
  function loadCustom(b, dataUrl){
    if (!dataUrl){ delete CUSTOM[b]; return; }
    const c={ src:dataUrl, buf:null }; CUSTOM[b]=c; const a=ac(); if (!a) return;
    fetch(dataUrl).then(r=>r.arrayBuffer()).then(x=>a.decodeAudioData(x)).then(buf=>{ c.buf=buf; }).catch(()=>{ c.bad=true; });
  }
  setTimeout(()=>{                                     // per-beast files; the old single roar file moves into the bear slot
    if (typeof BG_DB==='undefined') return;
    try{ const old=localStorage.getItem(ROAR_KEY); if (old){ loadCustom('bear', old); BG_DB.put(AKEY('bear'), old).then(()=>{ try{ localStorage.removeItem(ROAR_KEY); }catch(e){} }).catch(()=>{}); } }catch(e){}
    BEASTS.forEach(b=>BG_DB.get(AKEY(b)).then(v=>{ if (v && !CUSTOM[b]){ loadCustom(b, v); paintUi(); } }).catch(()=>{}));
  }, 600);
  function roar(beast, fx){ try{ roar0(beast, fx); }catch(e){ oops('sound', e); } }
  function roar0(beast, fx){
    const a=ac(); if (!a || !ST.roar) return; beast=SYNTH[beast]?beast:'bear';
    const t0=a.currentTime+0.02, c=CUSTOM[beast];
    const d=SFX_DEF[beast], f=d && SFXBUF[d[0]];
    if (c && c.buf){ const s=a.createBufferSource(), g=a.createGain(); s.buffer=c.buf; g.gain.value=ST.vol; s.connect(g).connect(a.destination); s.start(t0); }
    else if (f && f.buf){ const s=a.createBufferSource(), g=a.createGain(); s.buffer=f.buf; s.playbackRate.value=d[1]; g.gain.value=ST.vol; s.connect(g).connect(a.destination); s.start(t0); }
    else { if (d) sfxLoad(d[0]); SYNTH[beast](a, a.destination, ST.vol, t0); }      // file not loaded (yet): synth this once
    if (fx==='lightning') thunder(a, a.destination, ST.vol*0.7, t0+0.12);
  }
  function noiseBuf(a, dur, white){ const n=Math.floor(a.sampleRate*dur), b=a.createBuffer(1,n,a.sampleRate), d=b.getChannelData(0); let last=0;
    for (let i=0;i<n;i++){ const w=Math.random()*2-1; if (white) d[i]=w*0.5; else { last=(last+0.06*w)/1.06; d[i]=last*3.2; } } return b; }
  function outChain(a, dest, vol, thr){ const out=a.createGain(); out.gain.value=vol; const c=a.createDynamicsCompressor(); c.threshold.value=thr||-20; c.ratio.value=5; c.attack.value=0.004; c.release.value=0.2; out.connect(c).connect(dest); return out; }
  function filt(a, type, f, q){ const b=a.createBiquadFilter(); b.type=type; b.frequency.value=f; if (q!=null) b.Q.value=q; return b; }
  function curveRamp(p, pts, t0){ p.setValueAtTime(pts[0][1], t0); for (let i=1;i<pts.length;i++) p.linearRampToValueAtTime(pts[i][1], t0+pts[i][0]); }
  // one voiced growl / roar: saw voices on a pitch curve -> tremolo -> envelope -> drive -> formant filters
  function growl(a, dest, vol, t0, o){
    const D=o.D, out=outChain(a, dest, vol*(o.gain||0.7));
    const env=a.createGain(), at=o.att||0.16; env.gain.setValueAtTime(0.0001,t0); env.gain.exponentialRampToValueAtTime(1,t0+at); env.gain.setValueAtTime(1,t0+D*(o.hold||0.5)); env.gain.exponentialRampToValueAtTime(0.0001,t0+D);
    const trem=a.createGain(); trem.gain.value=1-(o.tremDepth||0.25); const lfo=a.createOscillator(); lfo.frequency.value=o.trem||27; const lg=a.createGain(); lg.gain.value=o.tremDepth||0.25; lfo.connect(lg).connect(trem.gain);
    const sh=a.createWaveShaper(), N=1024, cv=new Float32Array(N), k=o.drive||4.5; for (let i=0;i<N;i++){ const x=i/(N-1)*2-1; cv[i]=Math.tanh(k*x); } sh.curve=cv;
    const mix=a.createGain(); mix.gain.value=0.5;
    (o.form||[[270,1.1,1.0],[640,2.2,0.8],[1150,3.5,0.45],[2400,4,0.18]]).forEach(([f,q,g])=>{ const b=filt(a,'bandpass',f,q), gg=a.createGain(); gg.gain.value=g; sh.connect(b); b.connect(gg).connect(out); });
    const body=filt(a,'lowpass',o.bodyF||420), bg=a.createGain(); bg.gain.value=o.body||0.55; sh.connect(body); body.connect(bg).connect(out);
    mix.connect(trem).connect(env).connect(sh);
    const jit=a.createBufferSource(); jit.buffer=noiseBuf(a,D+0.2); const jl=filt(a,'lowpass',24), jg=a.createGain(); jg.gain.value=o.jit||140; jit.connect(jl).connect(jg);
    (o.voices||[['sawtooth',1,0.6],['sawtooth',1.5,0.35],['square',0.5,0.3]]).forEach(([type,mul,gn])=>{
      const v=a.createOscillator(); v.type=type; curveRamp(v.frequency, o.f.map(([t,f])=>[t,f*mul]), t0); jg.connect(v.frequency);
      const g=a.createGain(); g.gain.value=gn; v.connect(g).connect(mix); v.start(t0); v.stop(t0+D+0.05); });
    const ns=a.createBufferSource(); ns.buffer=noiseBuf(a,D+0.1); const nb=filt(a,'bandpass',o.raspF||520,0.7), ng=a.createGain(); ng.gain.value=o.rasp||0.9; ns.connect(nb).connect(ng).connect(mix);
    if (o.boom){ const bo=a.createOscillator(), bg2=a.createGain(); bo.type='sine'; bo.frequency.setValueAtTime(58,t0); bo.frequency.exponentialRampToValueAtTime(30,t0+0.7); bg2.gain.setValueAtTime(0.0001,t0); bg2.gain.exponentialRampToValueAtTime(0.9*o.boom,t0+0.03); bg2.gain.exponentialRampToValueAtTime(0.0001,t0+0.8); bo.connect(bg2).connect(out); bo.start(t0); bo.stop(t0+0.9); }
    jit.start(t0); ns.start(t0); lfo.start(t0); jit.stop(t0+D+0.1); ns.stop(t0+D+0.1); lfo.stop(t0+D+0.1);
  }
  function noiseHit(a, dest, vol, t0, o){                 // shaped noise burst (hiss, fire whoosh, thunder)
    const s=a.createBufferSource(); s.buffer=noiseBuf(a, o.D+0.1, o.white); const f=filt(a, o.type||'bandpass', o.f[0][1], o.q==null?0.8:o.q);
    curveRamp(f.frequency, o.f, t0); const g=a.createGain(); g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(vol,t0+(o.att||0.05)); g.gain.exponentialRampToValueAtTime(0.0001,t0+o.D);
    s.connect(f).connect(g).connect(dest); s.start(t0); s.stop(t0+o.D+0.1);
  }
  function screech(a, dest, vol, t0, o){                  // raptor call(s): FM saw through two resonant bands, optional echo
    const out=outChain(a, dest, vol*(o.gain||0.55), -24); let tgt=out;
    if (o.echo){ const d=a.createDelay(1); d.delayTime.value=o.echo; const fb=a.createGain(); fb.gain.value=0.4; const wet=a.createGain(); wet.gain.value=0.55; tgt=a.createGain(); tgt.connect(out); tgt.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(out); }
    for (const [s,dur,f0,f1] of o.calls){ const t=t0+s;
      const v=a.createOscillator(); v.type='sawtooth'; v.frequency.setValueAtTime(f0*0.8,t); v.frequency.linearRampToValueAtTime(f0,t+dur*0.12); v.frequency.exponentialRampToValueAtTime(f1,t+dur);
      const vib=a.createOscillator(); vib.frequency.value=o.vib||30; const vg=a.createGain(); vg.gain.value=f0*(o.vibD||0.025); vib.connect(vg).connect(v.frequency);
      const env=a.createGain(); env.gain.setValueAtTime(0.0001,t); env.gain.exponentialRampToValueAtTime(1,t+Math.min(0.03,dur*0.2)); env.gain.setValueAtTime(1,t+dur*0.55); env.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      const b1=filt(a,'bandpass',f0*1.05,5), b2=filt(a,'bandpass',f0*2.1,6), g1=a.createGain(), g2=a.createGain(); g1.gain.value=1.4; g2.gain.value=0.6;
      const hp=filt(a,'highpass',700); v.connect(hp).connect(env); env.connect(b1).connect(g1).connect(tgt); env.connect(b2).connect(g2).connect(tgt);
      v.start(t); vib.start(t); v.stop(t+dur+0.05); vib.stop(t+dur+0.05);
      noiseHit(a, tgt, 0.25, t, { D:dur, f:[[0,f0*1.4]], q:1.2, white:true, att:0.02 });
    }
  }
  function thunder(a, dest, vol, t0){
    const out=outChain(a, dest, vol, -16);
    noiseHit(a, out, 1.0, t0, { D:0.18, f:[[0,3200]], type:'highpass', q:0.5, white:true, att:0.004 });
    noiseHit(a, out, 0.9, t0+0.03, { D:1.8, f:[[0,260],[1.8,90]], type:'lowpass', q:0.7, att:0.08 });
  }
  const SYNTH = {
    bear:   (a,d,v,t)=>growl(a,d,v,t,{ D:1.9, f:[[0,78],[0.28,128],[0.9,104],[1.9,64]], boom:1 }),
    lion:   (a,d,v,t)=>growl(a,d,v,t,{ D:2.4, f:[[0,58],[0.32,104],[1.3,86],[2.4,44]], trem:16, tremDepth:0.3, drive:5,
              form:[[210,1,1],[470,2,0.9],[880,3,0.5],[1700,4,0.18]], bodyF:360, body:0.7, rasp:0.7, raspF:420, boom:1.2, hold:0.55 }),
    tiger:  (a,d,v,t)=>growl(a,d,v,t,{ D:1.7, f:[[0,92],[0.22,168],[0.9,132],[1.7,74]], trem:31, tremDepth:0.3, drive:5.5,
              form:[[320,1.2,1],[760,2.4,0.9],[1420,3.5,0.6],[2700,4,0.25]], rasp:1.5, raspF:1150, boom:0.7 }),
    jaguar: (a,d,v,t)=>{ for (let i=0;i<5;i++) growl(a,d,v*(i?0.85:1),t+i*0.3,{ D:0.24, att:0.03, hold:0.3, f:[[0,82],[0.08,124],[0.24,78]], trem:40, tremDepth:0.35,
              form:[[260,1.2,1],[620,2.2,0.8],[1200,3,0.5]], rasp:1.6, raspF:700, drive:6, boom:i?0:0.6, gain:0.8 }); },
    leopard:(a,d,v,t)=>{ noiseHit(a,d,0.5*v,t,{ D:0.5, f:[[0,3000],[0.5,2400]], type:'highpass', q:0.6, white:true, att:0.04 });
              growl(a,d,v,t+0.32,{ D:1.0, att:0.06, f:[[0,150],[0.15,236],[0.6,190],[1.0,130]], trem:46, tremDepth:0.35, drive:6,
              form:[[420,1.4,1],[980,2.6,0.8],[1900,3.5,0.5],[3200,4,0.2]], rasp:1.8, raspF:1800, boom:0, body:0.3 }); },
    eagle:  (a,d,v,t)=>screech(a,d,v,t,{ calls:[[0,0.78,2350,1500],[0.9,0.46,2550,1750]], vib:30 }),
    falcon: (a,d,v,t)=>screech(a,d,v,t,{ calls:[0,1,2,3].map(i=>[i*0.17,0.12,3150,2650]), vib:0.1, vibD:0 }),
    garuda: (a,d,v,t)=>{ screech(a,d,v,t,{ calls:[[0,1.05,1550,860],[1.12,0.55,1750,1000]], vib:24, echo:0.21, gain:0.6 });
              growl(a,d,v*0.55,t,{ D:1.4, f:[[0,70],[0.3,110],[1.4,60]], boom:0.8, rasp:0.5 }); },
    haetae: (a,d,v,t)=>{ SYNTH.tiger(a,d,v,t); thunder(a,d,v*0.6,t+0.15); },
    wolf:   (a,d,v,t)=>{ growl(a,d,v*0.85,t,{ D:0.75, att:0.05, f:[[0,120],[0.12,190],[0.75,110]], trem:38, tremDepth:0.35, drive:5.5,
              form:[[380,1.3,1],[900,2.4,0.8],[1800,3.5,0.4]], rasp:1.5, raspF:1300, boom:0, body:0.35 });
              const o=a.createOscillator(), g=a.createGain(), f=filt(a,'bandpass',900,3), vb=a.createOscillator(), vg=a.createGain();
              o.type='sawtooth'; const t1=t+0.7; o.frequency.setValueAtTime(380,t1); o.frequency.linearRampToValueAtTime(560,t1+0.35); o.frequency.setValueAtTime(560,t1+1.0); o.frequency.linearRampToValueAtTime(420,t1+1.6);
              vb.frequency.value=5.5; vg.gain.value=9; vb.connect(vg).connect(o.frequency);
              g.gain.setValueAtTime(0.0001,t1); g.gain.exponentialRampToValueAtTime(0.32*v,t1+0.25); g.gain.setValueAtTime(0.32*v,t1+1.1); g.gain.exponentialRampToValueAtTime(0.0001,t1+1.7);
              const lp=filt(a,'lowpass',1600); o.connect(lp).connect(f).connect(g).connect(d); o.start(t1); vb.start(t1); o.stop(t1+1.8); vb.stop(t1+1.8); },
    bull:   (a,d,v,t)=>{ noiseHit(a,d,0.6*v,t,{ D:0.35, f:[[0,1400],[0.35,600]], q:0.7, att:0.02 });
              growl(a,d,v,t+0.25,{ D:1.5, att:0.12, f:[[0,64],[0.3,92],[1.0,80],[1.5,52]], voices:[['sawtooth',1,0.6],['sawtooth',1.02,0.4],['square',0.5,0.4]],
              trem:9, tremDepth:0.2, drive:4, form:[[180,1,1],[420,1.6,0.9],[900,3,0.4]], bodyF:320, body:0.8, rasp:0.6, raspF:500, boom:0.9 }); },
    moose:  (a,d,v,t)=>growl(a,d,v,t,{ D:1.9, att:0.25, f:[[0,90],[0.5,150],[1.2,130],[1.9,70]], voices:[['sawtooth',1,0.6],['triangle',2,0.3],['square',0.5,0.25]],
              trem:7, tremDepth:0.18, drive:3.5, form:[[300,1.2,1],[700,2.5,0.9],[1300,3,0.4]], bodyF:380, body:0.6, rasp:0.5, raspF:600, boom:0.6, hold:0.6 }),
    elephant:(a,d,v,t)=>{ const out=outChain(a,d,v*0.55,-22), D=1.5;
              [['sawtooth',1,0.6],['sawtooth',1.006,0.5],['square',2,0.18]].forEach(([ty,m,gn])=>{ const o=a.createOscillator(); o.type=ty;
                o.frequency.setValueAtTime(330*m,t); o.frequency.linearRampToValueAtTime(560*m,t+0.18); o.frequency.setValueAtTime(560*m,t+0.85); o.frequency.linearRampToValueAtTime(470*m,t+D);
                const vb=a.createOscillator(), vg=a.createGain(); vb.frequency.value=7; vg.gain.value=14*m; vb.connect(vg).connect(o.frequency);
                const g=a.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gn,t+0.08); g.gain.setValueAtTime(gn,t+1.1); g.gain.exponentialRampToValueAtTime(0.0001,t+D);
                const b1=filt(a,'bandpass',1100,2.5), b2=filt(a,'bandpass',2300,4), g2=a.createGain(); g2.gain.value=0.5;
                o.connect(g); g.connect(b1).connect(out); g.connect(b2).connect(g2).connect(out); o.start(t); vb.start(t); o.stop(t+D+0.05); vb.stop(t+D+0.05); });
              noiseHit(a,out,0.35,t,{ D:D, f:[[0,1800]], q:1.2, att:0.06 }); growl(a,d,v*0.4,t+0.1,{ D:1.2, f:[[0,50],[0.4,70],[1.2,40]], boom:0.7, rasp:0.4 }); },
    condor: (a,d,v,t)=>{ noiseHit(a,d,0.5*v,t,{ D:0.6, f:[[0,2600],[0.6,1800]], type:'highpass', q:0.6, white:true, att:0.05 });
              screech(a,d,v,t+0.35,{ calls:[[0,0.7,1250,820],[0.8,0.45,1350,900]], vib:18, vibD:0.04, gain:0.5 }); },
    dragon: (a,d,v,t)=>{ growl(a,d,v,t,{ D:2.6, f:[[0,44],[0.42,84],[1.5,70],[2.6,34]], voices:[['sawtooth',1,0.6],['sawtooth',1.01,0.4],['square',0.5,0.45]],
              trem:13, tremDepth:0.3, drive:6.5, form:[[150,1,1],[380,1.8,0.9],[820,3,0.5],[1600,4,0.22]], bodyF:300, body:0.8, rasp:0.8, raspF:380, boom:1.5, hold:0.55 });
              noiseHit(a,d,0.55*v,t+0.3,{ D:1.7, f:[[0,300],[0.5,1800],[1.7,450]], q:0.6, att:0.25 }); },
  };
  const synthRoar = (a, vol) => SYNTH.bear(a, a.destination, vol, a.currentTime+0.02);   // kept for older callers

  /* ---------------- per-show state ---------------- */
  let show = null, preview = null;
  function newState(key){ return { key, last:null, roared:false, puffs:[], rings:[], snow:Array.from({length:150},()=>({x:Math.random()*941,y:Math.random()*1672,r:0.8+Math.random()*2,v:0.6+Math.random()*0.8})), embers:Array.from({length:60},()=>({x:Math.random()*941,y:Math.random()*1672,r:1+Math.random()*1.6,v:0.5+Math.random()*0.7,ph:Math.random()*6.28})) }; }

  function lay(im, Lr, k, ax, ay, dx, dy, rot){
    ctx.save(); ctx.translate(ax+(dx||0), ay+(dy||0)); if (rot) ctx.rotate(rot); if (k!==1) ctx.scale(k,k);
    ctx.drawImage(im, Lr.x-ax, Lr.y-ay, Lr.w, Lr.h); ctx.restore();
  }
  function flagWave(im, Lr, poleX, t){
    const N=36, sw=Lr.w/N;
    for (let i=0;i<N;i++){
      const x0=Lr.x+i*sw, u0=Math.max(0,Math.min(1,(x0-poleX)/Lr.w)), u1=Math.max(0,Math.min(1,(x0+sw-poleX)/Lr.w));
      const w0=Math.sin(u0*6.5-t*4.2)*(1.5+9*u0), w1=Math.sin(u1*6.5-t*4.2)*(1.5+9*u1);
      ctx.save(); ctx.transform(1,(w1-w0)/sw,0,1,x0,Lr.y+w0); ctx.drawImage(im, i*sw, 0, sw+0.6, Lr.h, 0, 0, sw+0.6, Lr.h); ctx.restore();
    }
  }
  function textRuns(runs, cx, cy, size, weight){       // runs: [text, colour] drawn centred as one line
    ctx.font=weight+' '+size+'px '+POP; ctx.textBaseline='middle'; ctx.textAlign='left';
    const ws=runs.map(([s])=>ctx.measureText(s).width), tot=ws.reduce((a,b)=>a+b,0); let x=cx-tot/2;
    runs.forEach(([s,c],i)=>{ if (c==='dia'){ const m=x+ws[i]/2; ctx.fillStyle='#e9b949'; ctx.beginPath(); ctx.moveTo(m,cy-size*0.22); ctx.lineTo(m+size*0.2,cy); ctx.lineTo(m,cy+size*0.22); ctx.lineTo(m-size*0.2,cy); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle=c; ctx.fillText(s,x,cy); } x+=ws[i]; });
  }

  /* ---------------- the card (poster coordinates, scaled to the canvas) ---------------- */
  function draw(t, info, E, P){
    const I=P.I, L=P.L, an=P.an;
    const dt = E.last==null ? 0 : Math.max(0, Math.min(0.1, t-E.last)); E.last=t;
    const s=W/P.w, Y0=(H-P.h*s)/2;
    let shake=0; if (t>2.0&&t<2.35) shake=7*(1-seg(t,2.0,2.35)); if (t>2.45&&t<3.2) shake=Math.max(shake,9*(1-seg(t,2.45,3.2)));
    const bgU=eo(seg(t,1.9,2.5)), punch=Math.sin(Math.PI*seg(t,2.45,3.4)), zoom=1+0.06*(1-bgU)+0.03*punch;
    ctx.save();
    ctx.fillStyle='#03050b'; ctx.fillRect(0,0,W,H);
    ctx.translate(0,Y0); ctx.scale(s,s);
    if (bgU<1){ ctx.fillStyle=rad(470,900,20,700,[[0,`rgba(255,190,90,${0.3*seg(t,0.1,0.8)})`],[0.5,'rgba(60,90,180,.10)'],[1,'rgba(0,0,0,0)']]); ctx.fillRect(0,0,P.w,P.h); }   // stage glow (hidden once the background is in)
    const fx=470-150*punch, fy=836-300*punch, sx=shake?(Math.random()*2-1)*shake:0, sy=shake?(Math.random()*2-1)*shake:0;
    ctx.translate(fx+sx,fy+sy); ctx.scale(zoom,zoom); ctx.translate(-fx,-fy);
    // background plate + live numbers in the poster's frames
    if (bgU>0){
      ctx.globalAlpha=bgU; ctx.drawImage(I.bg,0,0,P.w,P.h);
      const T=P.text;
      ctx.save(); ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=6;
      ctx.fillStyle='#ffffff'; ctx.font='800 44px '+POP; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(info.field), T.countries[0], T.countries[1]+2);
      textRuns([['CYCLE '+info.cycle,'#ffffff'],['   ','dia'],['LIVE','#ffffff']], T.cycle[0], T.cycle[1], 17, '600');
      const mm=String(Math.floor(info.lasted/60)).padStart(2,'0'), ss=String(Math.floor(info.lasted%60)).padStart(2,'0');
      textRuns([['LASTED ','#ffffff'],[mm+':'+ss,'#ffd24a'],['      ','dia'],[String(info.wins)+' ','#ffd24a'],['CAREER WIN'+(info.wins===1?'':'S'),'#ffffff'],['      ','dia'],['NEXT DRAW IN ','#ffffff'],[Math.max(0,info.left)+'S','#ffd24a']], T.stats[0], T.stats[1], 23, '600');
      ctx.restore();
      // eliminated flags pop into the grid one after another
      const g=P.grid, n=info.dead.length, cols=g.cols, rows=Math.max(1,Math.ceil(n/cols)), k=rows>g.rows ? g.rows/rows : 1, gt=seg(t,3.3,4.4);
      for (let i=0;i<n;i++){ const p=Math.max(0,Math.min(1,gt*1.4*n-i)); if (p<=0) continue;
        const r=g.r*k*(0.5+0.5*back(p)), x=g.x0+(i%cols)*g.dx, y=g.y0+Math.floor(i/cols)*g.dy*k, sp=sprites.get(info.dead[i]);
        if (sp){ ctx.globalAlpha=bgU*0.95; ctx.drawImage(sp, x-r, y-r, 2*r, 2*r); } }
      ctx.globalAlpha=bgU; ctx.save(); ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=5; ctx.fillStyle='#e8ecf6'; ctx.font='600 17px '+POP; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(Math.round(n*eo(gt))+' / '+info.field+' ELIMINATED', T.elimtxt[0], T.elimtxt[1]); ctx.restore();
      ctx.globalAlpha=1;
    }
    // companion beast: slides in, roars (surge + head shake about its chest), breathes
    const beastU=seg(t,1.1,1.9);
    if (beastU>0){
      const ru=seg(t,2.45,2.8), rd=seg(t,3.0,3.6), roarK=eo(ru)*(1-eo(rd)), idle=seg(t,3.6,4.2);
      const k=(1+0.075*roarK+0.008*Math.sin(t*2.1)*idle)*(0.9+0.1*eo(beastU));
      const rot=-0.045*roarK+0.018*Math.sin(t*19)*seg(t,2.5,2.7)*(1-seg(t,2.9,3.2))+0.006*Math.sin(t*1.3)*idle;
      const full=t>=1.9, im=full?I.beast:I.beastFade, Lr=full?L.beast:L.beastFade, [ax,ay]=an.beastPivot;
      ctx.globalAlpha=Math.min(1,beastU*2.2); lay(im, Lr, k, ax, ay, -170*(1-eo(beastU)), 0, rot); ctx.globalAlpha=1;
      const [mx,my]=an.mouth;
      if (ru>0 && !E.roared){ E.roared=true; for (let i=0;i<3;i++) E.rings.push({x:mx,y:my,t:-i*0.12}); if (info.sound) roar(P.beast, P.fx); }
      if (t>2.45 && t<3.4 && Math.random()<0.8) E.puffs.push({x:mx-26+Math.random()*16-8,y:my-14+Math.random()*16-8,vx:-120+Math.random()*100,vy:-140+Math.random()*100,r:14+Math.random()*12,t:0,life:0.9+Math.random()*0.6});
    }
    // warrior rises from below into the centre, flag waving; breathes once he stands
    const riseU=seg(t,0.2,1.2);
    if (riseU>0){
      const dy=(1-back(riseU))*900, br=1+0.004*Math.sin(t*1.8)*seg(t,3.6,4.2), [fxx,fyy]=an.feet, full=t>=1.9;
      if (bgU<1){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle=rad(470,700+dy,10,420,[[0,`rgba(255,210,120,${0.5*(1-bgU)*seg(t,0.2,0.8)})`],[1,'rgba(255,160,60,0)']]); ctx.fillRect(0,0,P.w,P.h); ctx.restore(); }
      ctx.save(); ctx.translate(fxx,fyy+dy); ctx.scale(1,br); ctx.translate(-fxx,-fyy);
      flagWave(I.flag, L.flag, an.pole[0], t);
      const im=full?I.body:I.bodyFade, Lr=full?L.body:L.bodyFade; ctx.drawImage(im, Lr.x, Lr.y, Lr.w, Lr.h);
      ctx.restore();
    }
    // roar effects
    ctx.save(); ctx.globalCompositeOperation='lighter';
    E.rings=E.rings.filter(r=>(r.t+=dt)<0.9);
    for (const r of E.rings){ if (r.t<0) continue; const u=r.t/0.9, R=40+u*420, cx=r.x-u*40, cy=r.y-u*30; ctx.fillStyle=rad(cx,cy,R*0.72,R,[[0,'rgba(200,235,255,0)'],[0.6,`rgba(205,238,255,${0.22*(1-u)})`],[1,'rgba(200,235,255,0)']]); ctx.fillRect(cx-R,cy-R,2*R,2*R); }
    E.puffs=E.puffs.filter(p=>(p.t+=dt)<p.life);
    for (const p of E.puffs){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.r+=40*dt; const a=0.2*Math.sin(Math.PI*p.t/p.life); ctx.fillStyle=rad(p.x,p.y,0,p.r,[[0,`rgba(225,242,255,${a})`],[1,'rgba(210,235,255,0)']]); ctx.fillRect(p.x-p.r,p.y-p.r,2*p.r,2*p.r); }
    ctx.restore();
    // title slams in with the background, then a light sweep every 3 s
    const tu=seg(t,1.9,2.15);
    if (tu>0){
      const k=1.35+(1-1.35)*eo(tu), tcx=L.title.x+L.title.w/2, tcy=L.title.y+L.title.h/2;
      ctx.globalAlpha=Math.min(1,tu*6); lay(I.title, L.title, k, tcx, tcy); ctx.globalAlpha=1;
      if (t>3.2){ const ph=((t-3.2)%3)/0.9; if (ph<=1) shine(I.title, L.title, ph); }
    }
    // snow + embers (one path per kind instead of one per particle)
    const wind=160+70*Math.sin(t*0.7);
    ctx.fillStyle='rgba(235,245,255,.8)'; ctx.globalAlpha=0.35+0.5*bgU; ctx.beginPath();
    for (const f of E.snow){ f.x+=wind*f.v*dt; f.y+=80*f.v*dt; if (f.x>961) f.x-=981; if (f.y>1682) f.y-=1692; ctx.moveTo(f.x+f.r,f.y); ctx.arc(f.x,f.y,f.r,0,7); }
    ctx.fill();
    ctx.globalAlpha=1; ctx.save(); ctx.globalCompositeOperation='lighter';
    for (const e of E.embers){ e.y-=55*e.v*dt; e.x+=(Math.sin(t*2+e.ph)*25+wind*0.2)*dt; if (e.y<-10){ e.y=1682; e.x=Math.random()*941; } if (e.x>951) e.x-=961;
      const a=0.5+0.5*Math.sin(t*6+e.ph); ctx.fillStyle=`rgba(255,${150+a*80|0},60,${(0.3+0.45*a)*(0.4+0.6*bgU)})`; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.fill(); }
    ctx.restore();
    ctx.restore();
    if (t>2.05&&t<2.35){ ctx.fillStyle=`rgba(255,240,205,${0.4*(1-seg(t,2.05,2.35))})`; ctx.fillRect(0,0,W,H); }
    if (t>2.45&&t<2.8){ ctx.fillStyle=`rgba(190,230,255,${0.3*(1-seg(t,2.45,2.8))})`; ctx.fillRect(0,0,W,H); }
    if (t<0.2){ ctx.fillStyle=`rgba(0,0,0,${1-t/0.2})`; ctx.fillRect(0,0,W,H); }
    if (info.preview){ ctx.save(); ctx.font='700 22px '+POP; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillText('TEST', W-18, H-40); ctx.restore(); }
  }
  let sc=null;
  function shine(im, Lr, ph){
    if (!sc) sc=document.createElement('canvas'); if (sc.width!==Lr.w || sc.height!==Lr.h){ sc.width=Lr.w; sc.height=Lr.h; }
    const g=sc.getContext('2d'); g.globalCompositeOperation='source-over'; g.clearRect(0,0,Lr.w,Lr.h); g.drawImage(im,0,0,Lr.w,Lr.h);
    g.globalCompositeOperation='source-in'; const bx=-Lr.w*0.3+ph*Lr.w*1.6, gr=g.createLinearGradient(bx-80,0,bx+80,Lr.h*0.3); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(0.5,'rgba(255,255,240,.7)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,Lr.w,Lr.h);
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.drawImage(sc, Lr.x, Lr.y); ctx.restore();
  }
  function hold(){ ctx.fillStyle='#03050b'; ctx.fillRect(0,0,W,H); }

  /* ---------------- layout B: title + logo + stats bar posters (A tier onwards) ----------------
     Same beats as the Russia card, but the beast MATERIALISES where it sits (glow-in, no slide) and its
     roar motion depends on its kind: big cats surge + head shake (jaguar: three grunts, snow leopard: lunge),
     birds beat their wings (the layer is bent in vertical strips, more toward the wing tips), dragons lunge.
     Breath effect per card: mist, fire, red lightning or a feather burst. Live values: the stats bar only. */
  const rgbOf = h => { const n=parseInt(String(h).slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255].join(','); };
  function statsLine(info, P){
    const T=P.text; if (!T || !T.stats) return;
    if (info.sc!=null){                                  // Super Chat pop: the viewer's handle instead of the numbers
      const h=info.sc, runs=[['★ '+(info.scLabel||'Super Chat').toUpperCase(),'#ffd84a'],['     ','dia'],[h||'THANK YOU!','#ffffff']];
      let size=(T.statsSize||24)*1.25; ctx.font='700 '+size+'px '+POP; const tot=runs.reduce((a,[x])=>a+ctx.measureText(x).width,0), lim=(T.statsW||700)*1.05;
      if (tot>lim) size*=lim/tot;
      ctx.save(); ctx.shadowColor='rgba(0,0,0,.8)'; ctx.shadowBlur=6; textRuns(runs, T.stats[0], T.stats[1], size, '700'); ctx.restore(); return;
    }
    const mm=String(Math.floor(info.lasted/60)).padStart(2,'0'), ss=String(Math.floor(info.lasted%60)).padStart(2,'0'), Y='#ffd84a', Wt='#ffffff';
    const runs=[['LASTED ',Wt],[mm+':'+ss,Y],['       ','dia'],[String(info.wins)+' ',Y],['CAREER WIN'+(info.wins===1?'':'S'),Wt],['       ','dia'],['NEXT DRAW IN ',Wt],[Math.max(0,info.left)+'S',Y]];
    let size=T.statsSize||24; ctx.font='600 '+size+'px '+POP; const tot=runs.reduce((a,[s])=>a+ctx.measureText(s).width,0);
    if (T.statsW) size*=Math.max(0.8, Math.min(1.12, T.statsW/tot));
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.7)'; ctx.shadowBlur=5; textRuns(runs, T.stats[0], T.stats[1], size, '600'); ctx.restore();
  }
  function beastPose(t, P){                              // scale, rotation, offset and wing-flap for this frame
    const ru=seg(t,2.45,2.8), rd=seg(t,3.0,3.6), roarK=eo(ru)*(1-eo(rd)), idle=seg(t,3.6,4.2), dir=P.dir||-1, b=P.beast;
    const shakeH=Math.sin(t*19)*seg(t,2.5,2.7)*(1-seg(t,2.9,3.2));
    let k=1, rot=0, dx=0, dy=0, flap=0;
    if (P.cls==='bird'){
      const w=seg(t,2.35,3.75), beats=b==='falcon'?3.5:2.5, env=Math.sin(Math.PI*w);
      flap=env*Math.sin(w*beats*2*Math.PI)*28 + idle*Math.sin(t*2*Math.PI*0.7)*5;
      k=1+0.04*roarK+0.006*Math.sin(t*1.7)*idle; dx=dir*12*roarK; dy=-6*roarK; rot=dir*0.02*roarK;
    } else if (P.cls==='dragon'){
      k=1+0.055*roarK+0.007*Math.sin(t*1.4)*idle; dx=dir*20*roarK; dy=6*roarK+4*Math.sin(t*1.1)*idle;
      rot=dir*0.03*roarK+0.014*shakeH+0.01*Math.sin(t*0.9)*idle;
    } else if (b==='elephant'){                       // head + trunk lift, slow sway
      k=1+0.05*roarK+0.007*Math.sin(t*1.2)*idle; dy=-10*roarK; dx=dir*6*roarK; rot=-dir*0.035*roarK+0.008*Math.sin(t*1.0)*idle;
    } else if (b==='bull'){                           // snort, then head toss down-forward with a shake
      k=1+0.05*roarK+0.007*Math.sin(t*1.8)*idle; dx=dir*18*roarK; dy=8*roarK; rot=dir*0.04*roarK+0.02*shakeH+0.006*Math.sin(t*1.3)*idle;
    } else if (b==='moose'){                          // head up, bellow
      k=1+0.05*roarK+0.007*Math.sin(t*1.5)*idle; dy=-12*roarK; dx=dir*8*roarK; rot=-dir*0.03*roarK+0.01*shakeH+0.006*Math.sin(t*1.1)*idle;
    } else if (b==='wolf'){                           // snarl lunge, then head up
      k=1+0.05*roarK+0.008*Math.sin(t*2.0)*idle; dx=dir*20*roarK; dy=-5*roarK; rot=-dir*0.02*roarK+0.014*shakeH+0.006*Math.sin(t*1.3)*idle;
    } else if (b==='jaguar'){
      const p=seg(t,2.45,3.95), pulse=p>0&&p<1 ? Math.pow(Math.max(0,Math.sin(p*Math.PI*5)),2)*(1-p*0.4) : 0;
      k=1+0.045*pulse+0.008*Math.sin(t*2.1)*idle; rot=dir*0.025*pulse+0.006*Math.sin(t*1.3)*idle; dx=dir*6*pulse;
    } else if (b==='leopard'){
      k=1+0.05*roarK+0.008*Math.sin(t*2.1)*idle; dx=dir*24*roarK; dy=-4*roarK; rot=dir*0.03*roarK+0.012*shakeH+0.006*Math.sin(t*1.3)*idle;
    } else {
      k=1+0.065*roarK+0.008*Math.sin(t*2.1)*idle; dx=dir*8*roarK; rot=dir*0.03*roarK+0.018*shakeH+0.006*Math.sin(t*1.3)*idle;
    }
    return { k, rot, dx, dy, flap, roarK };
  }
  function drawBeastB(im, Lr, P, pose, k0){
    const [ax,ay]=P.an.beastPivot, k=pose.k*k0;
    ctx.save(); ctx.translate(ax+pose.dx, ay+pose.dy); if (pose.rot) ctx.rotate(pose.rot); ctx.scale(k,k); ctx.translate(-ax,-ay);
    if (P.cls!=='bird' || Math.abs(pose.flap)<0.3){ ctx.drawImage(im, Lr.x, Lr.y, Lr.w, Lr.h); ctx.restore(); return; }
    const N=Math.max(24, Math.round(Lr.w/9)), sw=Lr.w/N, half=Math.max(ax-Lr.x, Lr.x+Lr.w-ax);
    const off = x => { const d=Math.abs(x-ax)/half; return -pose.flap*Math.pow(Math.max(0,(d-0.18)/0.82),1.35); };
    for (let i=0;i<N;i++){ const x0=Lr.x+i*sw, o0=off(x0), o1=off(x0+sw);
      ctx.save(); ctx.transform(1,(o1-o0)/sw,0,1,x0,Lr.y+o0); ctx.drawImage(im, i*sw, 0, sw+0.7, Lr.h, 0, 0, sw+0.7, Lr.h); ctx.restore(); }
    ctx.restore();
  }
  function newStateB(E, P){
    if (E.bInit) return; E.bInit=true; E.parts=[]; E.bolts=[];
    E.amb=Array.from({length:P.amb==='petals'?46:55},()=>({x:Math.random()*941,y:Math.random()*1672,r:P.amb==='petals'?4+Math.random()*4:1+Math.random()*1.6,v:0.5+Math.random()*0.7,ph:Math.random()*6.28,rot:Math.random()*6.28}));
  }
  function drawB(t, info, E, P){
    newStateB(E, P);
    const I=P.I, L=P.L, an=P.an, col=rgbOf(P.color), dir=P.dir||-1;
    const dt = E.last==null ? 0 : Math.max(0, Math.min(0.1, t-E.last)); E.last=t;
    const s=W/P.w, Y0=(H-P.h*s)/2, [mx,my]=an.mouth, [px,py]=an.beastPivot;
    let shake=0; if (t>2.0&&t<2.35) shake=6*(1-seg(t,2.0,2.35)); if (t>2.45&&t<3.2) shake=Math.max(shake,8*(1-seg(t,2.45,3.2)));
    const bgU=eo(seg(t,1.9,2.5)), punch=Math.sin(Math.PI*seg(t,2.45,3.4)), zoom=1+0.06*(1-bgU)+0.025*punch;
    ctx.save();
    ctx.fillStyle='#03050b'; ctx.fillRect(0,0,W,H);
    ctx.translate(0,Y0); ctx.scale(s,s);
    if (bgU<1){ ctx.fillStyle=rad(470,760,20,720,[[0,`rgba(${col},${0.22*seg(t,0.1,0.8)})`],[0.5,'rgba(60,90,180,.08)'],[1,'rgba(0,0,0,0)']]); ctx.fillRect(0,0,P.w,P.h); }
    const fx=470+(mx-470)*0.45*punch, fy=780+(my-780)*0.45*punch, sx=shake?(Math.random()*2-1)*shake:0, sy=shake?(Math.random()*2-1)*shake:0;
    ctx.translate(fx+sx,fy+sy); ctx.scale(zoom,zoom); ctx.translate(-fx,-fy);
    if (bgU>0){ ctx.globalAlpha=bgU; ctx.drawImage(I.bg,0,0,P.w,P.h); statsLine(info, P); ctx.globalAlpha=1; }
    // ---- beast: glows in where it sits, roars in its own way
    const beastU=seg(t,1.0,1.9), pose=beastPose(t, P);
    if (beastU>0){
      const e=eo(beastU), full=t>=1.9, im=full?I.beast:I.beastFade, Lr=full?L.beast:L.beastFade;
      const aura=0.5*(1-seg(t,1.8,2.7))*e+0.18*pose.roarK;
      if (aura>0.01){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle=rad(px,py-60,10,360,[[0,`rgba(${col},${0.42*aura})`],[1,`rgba(${col},0)`]]); ctx.fillRect(px-360,py-420,720,720); ctx.restore(); }
      if (bgU>0.97 && P.I.warp){ WARP.draw(P, pose); }            // on the background: bend the poster itself (clean)
      else { ctx.globalAlpha=Math.min(1,beastU*1.5); drawBeastB(im, Lr, P, pose, 1.07-0.07*e); ctx.globalAlpha=1; }
      const glow=0.55*(1-seg(t,1.25,2.2));
      if (glow>0.01){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=glow*Math.min(1,beastU*2); drawBeastB(im, Lr, P, pose, 1.07-0.07*e); ctx.restore(); }
      const ru=seg(t,2.45,2.8);
      if (ru>0 && !E.roared){ E.roared=true; for (let i=0;i<3;i++) E.rings.push({x:mx,y:my,t:-i*0.12}); if (info.sound) roar(P.beast, P.fx); }
      // breath / burst particles
      if (t>2.45 && t<3.5 && dt>0){
        if (P.fx==='fire'){ for (let i=0;i<5;i++) E.parts.push({k:'fire',x:mx+dir*10,y:my+8,vx:dir*(380+Math.random()*320),vy:-40+Math.random()*170,r:8+Math.random()*10,t:0,life:0.55+Math.random()*0.4}); }
        else if (P.fx==='wind'){ if (Math.random()<0.9) for (let i=0;i<3;i++){ const a=Math.random()*6.28, R=60+Math.random()*220; E.parts.push({k:'feather',x:px+Math.cos(a)*R,y:py-80+Math.sin(a)*R*0.6,vx:Math.cos(a)*(120+Math.random()*200),vy:Math.sin(a)*90-40,r:5+Math.random()*5,rot:Math.random()*6,vr:-4+Math.random()*8,t:0,life:0.9+Math.random()*0.6}); } }
        else if (Math.random()<0.8) E.parts.push({k:'puff',x:mx+dir*18+Math.random()*16-8,y:my-6+Math.random()*16-8,vx:dir*(60+Math.random()*100),vy:-120+Math.random()*90,r:14+Math.random()*12,t:0,life:0.9+Math.random()*0.6});
        if (P.fx==='lightning' && Math.random()<0.35) E.bolts.push(bolt(mx,my,dir));
      }
      if (P.fx==='lightning' && t>4 && Math.random()<0.012) E.bolts.push(bolt(px+(Math.random()-0.5)*260, py-120+(Math.random()-0.5)*200, Math.random()<0.5?-1:1, 0.6));
    }
    // ---- warrior rises from below into place, flag waving; breathes once he stands
    const riseU=seg(t,0.2,1.2);
    if (riseU>0){
      const dy=(1-back(riseU))*900, br=1+0.004*Math.sin(t*1.8)*seg(t,3.6,4.2), [fxx,fyy]=an.feet, full=t>=1.9;
      if (bgU<1){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle=rad(fxx,fyy-200+dy,10,420,[[0,`rgba(255,210,120,${0.45*(1-bgU)*seg(t,0.2,0.8)})`],[1,'rgba(255,160,60,0)']]); ctx.fillRect(0,0,P.w,P.h); ctx.restore(); }
      ctx.save(); ctx.translate(fxx,fyy+dy); ctx.scale(1,br); ctx.translate(-fxx,-fyy);
      flagWave(I.flag, L.flag, an.pole[0], t);
      const im=full?I.body:I.bodyFade, Lr=full?L.body:L.bodyFade; ctx.drawImage(im, Lr.x, Lr.y, Lr.w, Lr.h);
      ctx.restore();
    }
    // ---- roar effects
    ctx.save(); ctx.globalCompositeOperation='lighter';
    E.rings=E.rings.filter(r=>(r.t+=dt)<0.9);
    for (const r of E.rings){ if (r.t<0) continue; const u=r.t/0.9, R=40+u*420, cx=r.x+dir*u*40, cy=r.y-u*30; ctx.fillStyle=rad(cx,cy,R*0.72,R,[[0,`rgba(${col},0)`],[0.6,`rgba(${col},${0.2*(1-u)})`],[1,`rgba(${col},0)`]]); ctx.fillRect(cx-R,cy-R,2*R,2*R); }
    E.parts=E.parts.filter(p=>(p.t+=dt)<p.life);
    for (const p of E.parts){ const u=p.t/p.life; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if (p.k==='fire'){ p.vx*=1-1.2*dt; p.vy-=60*dt; const r=p.r*(1+u*3.5), a=0.55*(1-u);
        ctx.fillStyle=rad(p.x,p.y,0,r,[[0,`rgba(255,${240-u*140|0},${150-u*150|0},${a})`],[0.5,`rgba(255,${120-u*80|0},20,${a*0.6})`],[1,'rgba(200,30,0,0)']]); ctx.fillRect(p.x-r,p.y-r,2*r,2*r); }
      else if (p.k==='feather'){ p.vy+=40*dt; p.rot+=p.vr*dt; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=`rgba(${col},${0.7*Math.sin(Math.PI*u)})`; ctx.beginPath(); ctx.ellipse(0,0,p.r*1.8,p.r*0.5,0,0,7); ctx.fill(); ctx.restore(); }
      else { p.r+=40*dt; const a=0.2*Math.sin(Math.PI*u); ctx.fillStyle=rad(p.x,p.y,0,p.r,[[0,`rgba(${col},${a})`],[1,`rgba(${col},0)`]]); ctx.fillRect(p.x-p.r,p.y-p.r,2*p.r,2*p.r); } }
    E.bolts=E.bolts.filter(b=>(b.t+=dt)<b.life);
    for (const b of E.bolts){ const a=(1-b.t/b.life)*b.a; ctx.lineJoin='round';
      ctx.strokeStyle=`rgba(${col},${0.45*a})`; ctx.lineWidth=9; ctx.beginPath(); b.p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke();
      ctx.strokeStyle=`rgba(255,240,245,${0.9*a})`; ctx.lineWidth=2.4; ctx.stroke(); }
    ctx.restore();
    // ---- title slams in with the background, then a light sweep every 3 s
    const tu=seg(t,1.9,2.15);
    if (tu>0){
      const k=1.3+(1-1.3)*eo(tu), tcx=L.title.x+L.title.w/2, tcy=L.title.y+L.title.h/2;
      ctx.globalAlpha=Math.min(1,tu*6); lay(I.title, L.title, k, tcx, tcy); ctx.globalAlpha=1;
      if (t>3.2){ const ph=((t-3.2)%3)/0.9; if (ph<=1) shine(I.title, L.title, ph); }
    }
    // ---- ambient: embers or petals
    ctx.save();
    if (P.amb==='petals'){ const pc=rgbOf(P.petal);
      for (const f of E.amb){ f.x+=(-30+40*Math.sin(t*0.8+f.ph))*f.v*dt; f.y+=70*f.v*dt; f.rot+=1.6*dt*f.v; if (f.y>1690){ f.y=-10; f.x=Math.random()*941; } if (f.x<-20) f.x+=980;
        ctx.globalAlpha=(0.35+0.45*bgU)*(0.6+0.4*Math.sin(f.ph+t)); ctx.fillStyle=`rgb(${pc})`; ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.rot); ctx.scale(1,0.35+0.65*Math.abs(Math.sin(f.rot*1.3))); ctx.beginPath(); ctx.ellipse(0,0,f.r,f.r*0.62,0,0,7); ctx.fill(); ctx.restore(); }
    } else { ctx.globalCompositeOperation='lighter';
      for (const e of E.amb){ e.y-=55*e.v*dt; e.x+=(Math.sin(t*2+e.ph)*25+30)*dt; if (e.y<-10){ e.y=1682; e.x=Math.random()*941; } if (e.x>951) e.x-=961;
        const a=0.5+0.5*Math.sin(t*6+e.ph); ctx.fillStyle=`rgba(255,${150+a*80|0},60,${(0.3+0.45*a)*(0.4+0.6*bgU)})`; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.fill(); } }
    ctx.restore();
    ctx.restore();
    if (t>2.05&&t<2.35){ ctx.fillStyle=`rgba(255,240,205,${0.35*(1-seg(t,2.05,2.35))})`; ctx.fillRect(0,0,W,H); }
    if (t>2.45&&t<2.8){ ctx.fillStyle=`rgba(${col},${0.22*(1-seg(t,2.45,2.8))})`; ctx.fillRect(0,0,W,H); }
    if (t<0.2){ ctx.fillStyle=`rgba(0,0,0,${1-t/0.2})`; ctx.fillRect(0,0,W,H); }
    if (info.preview){ ctx.save(); ctx.font='700 22px '+POP; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillText('TEST', W-18, H-40); ctx.restore(); }
  }
  function bolt(x, y, dir, a){                           // jagged lightning from (x,y) outward
    const ang=(dir>0?0:Math.PI)+(Math.random()-0.5)*1.9, len=220+Math.random()*260, n=9, p=[[x,y]];
    for (let i=1;i<=n;i++){ const u=i/n, j=(Math.random()-0.5)*60*(1-u*0.3); p.push([x+Math.cos(ang)*len*u-Math.sin(ang)*j, y+Math.sin(ang)*len*u+Math.cos(ang)*j]); }
    return { p, t:0, life:0.09+Math.random()*0.08, a:a||1 };
  }

  /* ---------------- quick mode: everything pops in together, roar straight away, 5 s screen ----------------
     The full timeline is re-used: it is held at its 'everything assembled' moment (2.40 s) while the whole
     card pops in (scale + fade + flash, 0.35 s), then runs on from there, so the roar hits at ~0.4 s. */
  const QUICK_AT=2.40, QPOP=0.35, FULL_MS=(typeof CFG!=='undefined' && CFG.WINNER_MS) || 10000, QUICK_MS=5000;
  function applyDuration(){ if (typeof CFG!=='undefined') CFG.WINNER_MS = ST.anim==='quick' ? QUICK_MS : FULL_MS; }
  applyDuration();
  function render(fn, t, info, E, P){
    if (ST.anim!=='quick'){ fn(t, info, E, P); return; }
    const vt = t<QPOP ? QUICK_AT : QUICK_AT+(t-QPOP), u=Math.min(1, t/QPOP), k=0.8+0.2*back(u);   // pops up from 80 % with a small overshoot
    ctx.save(); ctx.fillStyle='#03050b'; ctx.fillRect(0,0,W,H);
    ctx.translate(W/2,H*0.45); ctx.scale(k,k); ctx.translate(-W/2,-H*0.45);
    fn(vt, info, E, P); ctx.restore();
    if (t<QPOP){ ctx.fillStyle=`rgba(3,5,11,${0.92*(1-eo(u))})`; ctx.fillRect(0,0,W,H); }
    const fl=0.42*(1-seg(t,QPOP*0.7,QPOP+0.3)); if (t>QPOP*0.7 && fl>0){ ctx.fillStyle=`rgba(255,244,215,${fl})`; ctx.fillRect(0,0,W,H); }
  }

  /* ---------------- Super Chat pop: ~1.2 s silent burst of the country's card with the viewer's handle ----------------
     Opens as a gold-rimmed circle from the ring centre while the card grows, the beast roars (no sound),
     then the circle snaps shut. The round keeps running underneath. Art is loaded the moment the Super
     Chat arrives; if it isn't ready within SC_WAIT the pop is skipped (the normal popup card still shows). */
  const SC_MS=1200, SC_WAIT=4000, SC_DELAY=900, SC_OPEN=0.22, SC_CLOSE=0.95;   // SC_DELAY: the thank-you card shows first              // the burst is designed at 1.2 s and time-scaled to ST.scDur
  const scDur = () => Math.max(1, Math.min(3, +ST.scDur || 1));
  const scQ=[]; let scCur=null, scN=0, scSkip=0;
  const handle = u => { u=String(u||'').trim().replace(/^@+/,''); if (!u) return ''; u='@'+u; return u.length>24 ? u.slice(0,23)+'…' : u; };
  let genI=0;
  function scPop(code, user, force, label, opt){
    opt=opt||{};
    if (!code && M){ const ks=Object.keys(M.kits).filter(k=>M.kits[k].layout==='B'); if (!ks.length) return false;   // nobody named a country: generic champion card
      const h=handle(user)||'@VIEWER'; code='~G:'+ks[(genI++)%ks.length]+':'+h; }
    code=up(code); if ((!ST.scPop && !force) || !M || !(force ? hasTest(code) : has(code))) return false;
    if (scQ.length>=6) scQ.shift(); scQ.push({ code, user:handle(user), label:String(label||''), t:now(), force:!!force, onStart:opt.onStart||null }); if (opt.onSkip) scQ[scQ.length-1].onSkip=opt.onSkip; ensure(code, force); return true;
  }
  function scDraw(){
    if (!scCur){
      while (scQ.length){ const q=scQ[0], r=LOADED.get(q.code);
        if (r && r.state==='ready' && !(G && G.phase==='WINNER') && (q.force || now()-q.t>=SC_DELAY)){ scQ.shift();
          if (q.onStart) try{ q.onStart(); }catch(e){ oops('pop start', e); }
          scN++; scCur={ code:q.code, t0:now(), frozen:null, dur:scDur(), E:newState('sc'), info:{ code:q.code, sc:q.user, scLabel:q.label, lasted:0, wins:Math.max(1,careers()[q.code]||0), left:0, dead:[], field:fieldN(), cycle:(G?G.roundNo:1), sound:false } }; break; }
        if ((r && r.state==='fail') || now()-q.t>SC_WAIT || !r){ scQ.shift(); scSkip++; if (q.onSkip) try{ q.onSkip(); }catch(e){} continue; }
        break; }
      if (!scCur) return;
    }
    const real=scCur.frozen!=null ? scCur.frozen : (now()-scCur.t0)/1000, t=real*(SC_MS/1000)/scCur.dur, r=LOADED.get(scCur.code);
    if (t>SC_MS/1000 || !r || r.state!=='ready'){ scCur=null; return; }
    const P=r.pack, cx=W/2, cy=H*0.45, D=Math.hypot(Math.max(cx,W-cx), Math.max(cy,H-cy))*1.02;
    const uin=Math.min(1,t/SC_OPEN), uout=seg(t,SC_CLOSE,SC_MS/1000), R=Math.max(1, D*eo(uin)*(1-uout*uout));
    const k=(0.84+0.16*back(uin))*(1+0.07*seg(t,SC_OPEN,SC_MS/1000));        // pops up, keeps growing
    const vt=QUICK_AT+Math.max(0,t-0.04)*1.05;                                  // assembled card, roar at ~0.1-0.6 s
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.clip();
    ctx.translate(cx,cy); ctx.scale(k,k); ctx.translate(-cx,-cy);
    (P.B?drawB:draw)(vt, scCur.info, scCur.E, P);
    if (ST.scTop && P.hb && scCur.info.sc) handleBanner(P, scCur.info, t);
    ctx.restore();
    if (R<D){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='rgba(255,207,61,.95)'; ctx.lineWidth=12; ctx.shadowColor='#ffcf3d'; ctx.shadowBlur=36;
      ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke(); ctx.restore(); }
    const fl=0.12*(1-seg(t,0.1,0.3)); if (t>0.1 && fl>0){ ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.clip(); ctx.fillStyle=`rgba(255,244,215,${fl})`; ctx.fillRect(0,0,W,H); ctx.restore(); }
  }
  const scBusy = () => !!scCur || scQ.length>0;
  function handleBanner(P, info, t){              // the viewer's @handle in the card's upper half, at the spot picked by cut/handle_box.py
    const [bx,by,bw,bh]=P.hb, s=W/P.w, Y0=(H-P.h*s)/2, u=eo(seg(t,0.08,0.3));
    if (u<=0) return;
    const lab='★ '+(info.scLabel||'Super Chat').toUpperCase(), h=info.sc||'';
    ctx.save(); ctx.translate(0,Y0); ctx.scale(s,s); ctx.globalAlpha=u; ctx.translate(0,(1-u)*-14);
    const r=bh*0.3; ctx.beginPath(); ctx.moveTo(bx+r,by); ctx.arcTo(bx+bw,by,bx+bw,by+bh,r); ctx.arcTo(bx+bw,by+bh,bx,by+bh,r); ctx.arcTo(bx,by+bh,bx,by,r); ctx.arcTo(bx,by,bx+bw,by,r); ctx.closePath();
    const gr=ctx.createLinearGradient(0,by,0,by+bh); gr.addColorStop(0,'rgba(10,8,18,.80)'); gr.addColorStop(1,'rgba(4,4,10,.86)'); ctx.fillStyle=gr; ctx.fill();
    ctx.shadowColor='rgba(255,200,70,.75)'; ctx.shadowBlur=18; ctx.lineWidth=4; ctx.strokeStyle='#e8b64a'; ctx.stroke(); ctx.shadowBlur=0;
    ctx.textAlign='center'; ctx.textBaseline='middle'; const cx=bx+bw/2;
    let f1=26; ctx.font='700 '+f1+'px '+POP; ctx.fillStyle='#ffd84a'; ctx.fillText(lab, cx, by+bh*0.28);
    let f2=50; ctx.font='800 '+f2+'px '+POP; while (f2>26 && ctx.measureText(h).width>bw-36){ f2-=2; ctx.font='800 '+f2+'px '+POP; }
    ctx.lineWidth=f2*0.12; ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.lineJoin='round'; ctx.strokeText(h, cx, by+bh*0.66); ctx.fillStyle='#ffffff'; ctx.fillText(h, cx, by+bh*0.66);
    ctx.restore();
  }

  /* ---------------- hooks ---------------- */
  function drawReal(){                                  // called from drawWinner(); true = handled, false = draw the default card
    try{ return drawReal0(); }
    catch(e){ const code=G && G.winner ? up(G.winner.c.code) : ''; oops('winner art', e, code); failArt(code); if (show) show.fellBack=true; recover(); return false; }
  }
  function drawReal0(){
    if (!G || !G.winner || ST.style!=='art') return false;
    const code=up(G.winner.c.code); if (!has(code)) return false;
    const key=G.roundNo+':'+code;
    if (!show || show.key!==key){ show=newState(key); show.code=code; show.start=null; show.fellBack=false; ensure(code); }
    if (show.fellBack) return false;
    if (show.start==null){
      if (!ready(code)){
        const r=LOADED.get(code);
        if (G.tPhase<WAIT_MS && r && r.state==='loading'){ hold(); return true; }   // nearly there: short dark hold
        show.fellBack=true; return false;                                          // not in time: current card this round
      }
      show.start=G.tPhase;
    }
    const P=pack(code); if (!P){ show.fellBack=true; return false; }
    const dead=G.dead.map(d=>d.c.code).filter(x=>x!==code);
    render(P.B?drawB:draw, (G.tPhase-show.start)/1000, { code, lasted:G.winner.lasted, wins:(careers()[code]||1), left:Math.ceil((CFG.WINNER_MS-G.tPhase)/1000), dead, field:fieldN(), cycle:G.roundNo, sound:true }, show, P);
    return true;
  }
  function covers(){ try{ return covers0(); }catch(e){ oops('covers', e); return false; } }
  function covers0(){                                   // the art fills the whole canvas: the arena underneath need not be drawn
    if (preview) return preview.t0!=null && (now()-preview.t0)>250 && ready(preview.code);
    if (scCur){ const t=(scCur.frozen!=null ? scCur.frozen : (now()-scCur.t0)/1000)*(SC_MS/1000)/scCur.dur; if (t>SC_OPEN+0.03 && t<SC_CLOSE) return true; }
    if (ST.style==='art' && G && G.phase==='WINNER' && G.winner && show && show.start!=null && !show.fellBack && show.key===G.roundNo+':'+up(G.winner.c.code)) return (G.tPhase-show.start)>250;
    return false;
  }
  function overlay(){
    try{ overlay0(); }
    catch(e){ const code=preview ? preview.code : scCur ? scCur.code : ''; oops(preview?'test screen':'super chat pop', e, code); failArt(code);
      if (preview){ preview=null; note('That art could not be shown, so it was skipped. The game carries on.'); } scCur=null; recover(); }
  }
  function overlay0(){                                  // every frame: prefetch scan + manual test, drawn over everything
    scan();
    if (!preview){ scDraw(); return; }
    const r=LOADED.get(preview.code);
    if (!r || r.state==='fail'){ const c=BY_CODE.get(preview.code); stop(); note('The art for '+(c?c.name:preview.code)+' could not be loaded, so it was skipped. A real win shows the default card.'); return; }
    if (r.state!=='ready'){ hold(); return; }
    if (preview.t0==null) preview.t0=now();
    const t=preview.frozen!=null ? preview.frozen : (now()-preview.t0)/1000;
    if (t>CFG.WINNER_MS/1000){ stop(); return; }
    preview.info.left=Math.ceil(CFG.WINNER_MS/1000-t); render(r.pack.B?drawB:draw, t, preview.info, preview.E, r.pack);
  }
  function play(code){
    code=up(code); if (!ensure(code, true)) return false; ac();
    const pool=(G && G.dead && G.dead.length>20 ? G.dead.map(d=>d.c.code) : COUNTRIES.map(c=>c.code)).filter(x=>x!==code);
    for (let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    const field=fieldN(), dead=pool.slice(0, field-1);
    preview={ code, t0:null, E:newState('test'), info:{ code, preview:true, lasted:300+Math.random()*200, wins:Math.max(1,careers()[code]||0), left:Math.round(CFG.WINNER_MS/1000), dead, field, cycle:(G?G.roundNo:1), sound:true } };
    return true;
  }
  function stop(){ preview=null; paintUi(); }
  const active = () => !!preview;
  function seek(t, freeze){ if (preview && preview.t0!=null){ preview.t0=now()-t*1000; preview.E.last=null; preview.frozen=freeze?t:null; } }   // testing helper (freeze = hold that frame)

  /* ---------------- operator panel (Winner tab) ---------------- */
  const $ = id => document.getElementById(id);
  function note(s){ const n=$('waNote'); if (n) n.textContent=s; }
  function status(){
    const pc=M?Object.keys(M.posters).length:0, kc=M?Object.values(M.kitCountries).filter(k=>!k.testOnly).length:0, kt=M?Object.values(M.kitCountries).filter(k=>k.testOnly).length:0;
    const mem=[...LOADED.entries()].map(([c,r])=>c+(r.state==='ready'?'':r.state==='loading'?' (loading)':' (failed)'));
    return { manifest:mStatus, posters:pc, kits:kc, kitTests:kt, inMemory:mem, files:RES.size, updated:M&&M.updated };
  }
  let wiredList='';
  function paintUi(){
    if (!$('waStyle')) return;
    [...$('waStyle').children].forEach(b=>b.classList.toggle('on', b.dataset.v===ST.style));
    if ($('waAnim')) [...$('waAnim').children].forEach(b=>b.classList.toggle('on', b.dataset.v===ST.anim));
    if ($('waScTop')) [...$('waScTop').children].forEach(b=>b.classList.toggle('on', b.dataset.v===(ST.scTop?'top':'bottom')));
    if ($('waScDur')){ $('waScDur').value=scDur(); $('waScDurV').textContent=scDur().toFixed(1)+' s'; }
    if ($('waSc')) [...$('waSc').children].forEach(b=>{ if (b.dataset.v!=='test') b.classList.toggle('on', b.dataset.v===(ST.scPop?'on':'off')); });
    [...$('waRoar').children].forEach(b=>b.classList.toggle('on', b.dataset.v===(ST.roar?'on':'off')));
    $('waVol').value=ST.vol; $('waVolV').textContent=Math.round(ST.vol*100)+'%';
    const bsel=$('waBeast'), bb=bsel?bsel.value:'bear', cc=CUSTOM[bb];
    if (bsel && !bsel.options.length){ bsel.innerHTML=BEASTS.map(b=>`<option value="${b}">${BEAST_NAME[b]}</option>`).join(''); bsel.value='lion'; }
    if (bsel){ const used=M?[...new Set(Object.values(M.posters).concat(Object.values(M.kits)).map(e=>e.beast||'bear'))]:[];
      [...bsel.options].forEach(o=>{ const on=CUSTOM[o.value]; o.textContent=BEAST_NAME[o.value]+(on?'  · your file':'')+(used.includes(o.value)?'':'  (no card yet)'); }); }
    $('waRoarNote').textContent = cc ? (cc.bad ? 'Your file for this beast could not be decoded - pick another mp3/ogg/wav.' : 'Using your own file for this beast.') : (SFX_DEF[bb] ? 'Using the default recording for this beast.' : 'Using the built-in sound for this beast.');
    const s=status(), el=$('waArt');
    if (el) el.innerHTML = s.manifest!=='ok' ? '⚠ '+s.manifest
      : `<b>${s.posters}</b> countries with their own poster · <b>${s.kits}</b> on shared kits`+(s.kitTests?` · ${s.kitTests} kit test-only`:'')+
        `<br>Loaded right now: ${s.inMemory.length?s.inMemory.join(', '):'none'} (art loads when a country is in the last ${PREFETCH_AT}).`;
    const sig=M?M.updated:'';
    if (sig!==wiredList) fillList();
  }
  function fillList(){
    const sel=$('waCountry'); if (!sel) return; wiredList=M?M.updated:''; const keep=sel.value;
    const P=M?Object.keys(M.posters):[], K=M?Object.keys(M.kitCountries):[];
    const nm=k=>{ const c=BY_CODE.get(k); return c?c.name:k; };
    const list=[...P.map(k=>[k,'★ '+nm(k)+' (poster)']), ...K.map(k=>[k,'☆ '+nm(k)+(M.kitCountries[k].testOnly?' (kit test)':' (kit)')]),
      ...ALL_COUNTRIES.filter(c=>!P.includes(c.code)&&!K.includes(c.code)).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.code,c.name])];
    sel.innerHTML=list.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
    if (keep) sel.value=keep;
  }
  function wire(){
    if (!$('waStyle')) return;
    fillList();
    $('waStyle').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; ST.style=b.dataset.v; save(); paintUi(); });
    if ($('waAnim')) $('waAnim').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; ST.anim=b.dataset.v; save(); applyDuration(); paintUi(); });
    $('waRoar').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; ST.roar=b.dataset.v==='on'; save(); paintUi(); });
    $('waVol').addEventListener('input',()=>{ ST.vol=+$('waVol').value; save(); paintUi(); });
    if ($('waScTop')) $('waScTop').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; ST.scTop=b.dataset.v==='top'; save(); paintUi(); });
    if ($('waScDur')) $('waScDur').addEventListener('input',()=>{ ST.scDur=Math.round(parseFloat($('waScDur').value)*10)/10; save(); paintUi(); });
    if ($('waSc')) $('waSc').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return;
      if (b.dataset.v==='test'){ const code=$('waCountry').value, c=BY_CODE.get(code), u=($('waScUser')&&$('waScUser').value)||'@TestViewer';
        note(scPop(code, u, true) ? 'Super Chat pop for '+(c?c.name:code)+' from '+handle(u)+' ('+scDur().toFixed(1)+' s, silent).' : 'No art for '+(c?c.name:code)+' yet.'); return; }
      ST.scPop=b.dataset.v==='on'; save(); paintUi(); });
    $('waTest').addEventListener('click',()=>{ const o=ST.roar; ST.roar=true; roar($('waBeast')?$('waBeast').value:'bear'); ST.roar=o; });
    if ($('waBeast')) $('waBeast').addEventListener('change', paintUi);
    $('waBtns').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return;
      if (b.dataset.v==='stop'){ stop(); note('Stopped.'); return; }
      const code=$('waCountry').value, c=BY_CODE.get(code);
      if (!hasTest(code)){ note('No art for '+(c?c.name:code)+' yet — a real win shows the current card.'); return; }
      play(code); note('Loading + playing the art reveal for '+(c?c.name:code)+' ('+(ST.anim==='quick'?5:10)+' s, the round keeps running underneath).'); });
    $('waFile').addEventListener('change',()=>{ const f=$('waFile').files[0]; if (!f) return; const r=new FileReader();
      const b=$('waBeast')?$('waBeast').value:'bear';
      r.onload=()=>{ loadCustom(b, r.result); paintUi();
        BG_DB.put(AKEY(b), r.result).then(()=>{ $('waRoarNote').textContent='Saved: your file plays for every '+b+' card.'; })
          .catch(()=>{ $('waRoarNote').textContent='Plays this session only (could not save it in this browser).'; }); $('waFile').value=''; };
      r.readAsDataURL(f); });
    $('waReset').addEventListener('click',()=>{ const b=$('waBeast')?$('waBeast').value:'bear'; loadCustom(b, null); BG_DB.put(AKEY(b), null).catch(()=>{}); paintUi(); });
    paintUi();
  }
  setTimeout(()=>{ try{ wire(); }catch(e){ console.warn('winart panel', e); } }, 300);
  return { sfx: ()=>Object.fromEntries(Object.entries(SFXBUF).map(([k,v])=>[k, v.buf ? +v.buf.duration.toFixed(2) : (v.bad?'bad':'loading')])), SFX_DEF, scPop:safe(scPop,false,'super chat pop'), scBusy:safe(scBusy,false), scShowing:()=>!!scCur, shownLast:safe(()=>!!(show && show.start!=null && !show.fellBack),false), errors:()=>errN, scStats: ()=>({ started:scN, skipped:scSkip, queued:scQ.length, playing:scCur?scCur.code:null }), scSeek: t=>{ if (scCur){ scCur.frozen=t; scCur.E.last=null; } }, setAnim:m=>{ ST.anim=m; applyDuration(); }, use:safe(use,false), has:safe(has,false), hasTest:safe(hasTest,false), ready:safe(ready,false), ensure:safe(ensure,null,'loading'), drawReal, overlay, covers, play:safe(play,false,'test'), stop:safe(stop), seek, active:safe(active,false), roar, synthRoar, SYNTH, thunder, BEASTS, ST, status,
           get DATA(){ return M; }, get M(){ return M; }, PREFETCH_AT, KEEP };
})();
