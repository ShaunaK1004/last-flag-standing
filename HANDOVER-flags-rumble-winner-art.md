# HANDOVER: Flags Rumble (vertical live game), animated poster-art winner screen, v3 (14 A-tier cards in layout B, per-beast sounds)

Paste this whole file into the new chat together with **`flags-rumble-site.zip`**. That zip is the GitHub repo: game, art, tools and this file. Then send the country art zips (tier-wise or in batches).

---

## 0. Who you are working with and how to work
- **Who:** Shaunak, an independent creator. He makes YouTube Shorts and 24/7 YouTube Live games, played through OBS.
- **Hosting:** the game lives on GitHub, deploys to Vercel, and OBS opens the Vercel URL as a Browser Source at 1080×1920.
- **Answers and files:** direct, honest assessments, and production-ready files he can copy and paste.
- **Every HTML delivery comes with the downloadable HTML file.**
  - `index.html` is about 1.8 MB, with a 1.3 MB flag-data line, and it needs `winart/` next to it.
  - So send the file or the zip only. Don't publish it as an artifact.
- **How-tos:** very simple steps.
- **Never redraw or re-imagine his art.** Use the original poster pixels; only cut them into layers and animate them.
- **Keep every existing feature working.** Edit in place, with the same localStorage keys.

## 1. The game (unchanged parts)
- **File:** `index.html`, "FLAGS RUMBLE: LAST FLAG STANDING". Single file, 1080×1920 canvas.
  - The operator panel is a sibling at x=1080.
  - `bg-*.jpg` sit next to it and fall back to a starfield.
- **Rounds:** `newDraw()` drops `fieldN()` (64) countries. When one is left:
  - `G.phase='WINNER'` for `CFG.WINNER_MS`=10 s.
  - `G.winner={c, lasted}`.
  - `addWin(code)` (career wins in localStorage `cbr_wins`), `SFX.win()`, `COMMENTARY.winner()`.
- **Country lookups:** `COUNTRIES` / `ALL_COUNTRIES` (196), `BY_CODE` (upper-case codes).
  - Sprites: `sprites.get(code)`.
  - Real SVG flags as 640×480 Images: `FLAG_IMG[code.toLowerCase()]`.
  - Procedural fallback: `paintFlag(ctx, ops, w, h)`.
- **Tiers already in the game:** `RANK`, and `TIERS` = A 16 / B 16 / C 68 / D 95.
  - A/B/C (100) get their own posters. D (95) uses shared kits.
- **Sound, HUD, live cards and paid events:** as before.
  - `ac()`, `SFX`; `drawHUD()` / `drawLower()`.
  - `LIVECARD.push(title, sub, code, col)` (3.4 s; the prompt fades while a card shows).
  - `paidEvent(m, …)` with `m.kind` = subscribe / superchat / member / gift / milestone; `CHAT.ingest({...})` from the Test tab.

## 2. What v2 changed (this delivery)
**The art is no longer embedded.** The repo layout:
```
index.html  vercel.json  .vercelignore  README.md  bg-*.jpg (his)
winart/manifest.json        source of truth, written only by tools/winart_pack.py
winart/manifest.js          window.WINART_MANIFEST = {...}  ← the game loads this via a <script> tag (works on http AND file://)
winart/c/<code>/            poster countries: bg, body, flag, beast, title  (<slot>-<sha1-8>.webp)
winart/kits/<kit>/          shared kits: body, beast, flag (= grey shade map), plate (optional title plate)
winart/bg/<name>-<hash>.webp  shared backgrounds for kit countries
tools/winart_pack.py        poster | kit | bg | map | unmap | remove | list
tools/build_html.py         splices tools/src/winart_module.js into the game HTML → index.html (+ render() hook, Winner-tab status line)
tools/src/winart_module.js  the WINART module source (edit this, then rebuild)
tools/cut/                  the SAM cutting scripts from v1 (seg1/seg2/layers/build_vertical/build_layers)
tools/art-src/demo_kit/     source PNGs + meta.json of the demo kit
```

**Manifest format (format 2)**
- `layout`: `{grid, text}`. The shared HUD positions in poster px (941×1672).
- `posters.<CODE>`:
  - `beast`, `w`, `h`.
  - `layers.{bg,body,flag,beast,title}`, each `{x,y,w,h,f}`. `f` is relative to `winart/`.
  - `anchors {mouth, beastPivot, feet, pole}`.
  - `fade {body:[y0,y1], beast:[y0,y1]}`.
  - Optional `grid` / `text` overrides.
- `kits.<name>`:
  - `beast`, `layers.{body,beast,flag,plate?}`, `anchors`, `fade`.
  - `flagCols` (cloth top/bottom in poster y every `flagColStep` px).
  - `title {ball:[cx,cy,r], name:[cx,cy,maxW,size], nameBand}`.
- `bgs.<name>`: `{f}`.
- `kitCountries.<CODE>`: `{kit, bg, testOnly?}`. Test-only entries play from the Winner tab only, never on a real win.

**WINART v2 runtime**
- **Prefetch:** `scan()` runs inside `overlay()`, every 300 ms. When `alive().length <= PREFETCH_AT` (6), it calls `ensure(code)` for each.
- **Decoding:**
  - On http: `fetch` → `blob` → `createImageBitmap`, decoded off the main thread.
  - On file://: `Image` + `decode()` + `createImageBitmap`.
- **Built at load, never downloaded:**
  - `bodyFade` / `beastFade`: a destination-out gradient over the `fade` ranges.
  - Kit flag (`makeKitFlag`): the country flag is drawn in 1 px columns stretched between the interpolated `flagCols`. Then `hard-light` with the shade map (50 % grey = unchanged), then `destination-in` with the shade map.
  - Kit title (`makeKitTitle`): the flag sprite in `ball`, then `plate`, then the name in "FR Bungee" with a silver gradient, shrink-to-fit inside `maxW`.
- **Memory:**
  - `RES` is shared decoded resources with ref-sets.
  - `LOADED` holds per-country records, LRU-trimmed to `KEEP` (8). Bitmaps are `close()`d when their last user goes.
  - The guard set (on screen now, in the final 6, in a test) is never evicted.
  - `warm()` draws each new bitmap once at 1×1, alpha 0.004, to push it to the GPU.
- **`drawReal()` at the win:**
  - Ready: the art starts.
  - Still loading and `tPhase` < `WAIT_MS` (1200): dark `hold()`, then the art clock starts from that moment.
  - Otherwise: `show.fellBack=true`, and the current card plays for the rest of that round.
- **`covers()`:** true while the art fills the canvas. `render()` then skips arena / HUD drawing, via a hook inserted by `build_html.py` at the top of `render()`.
- **Manifest refresh:** re-read every 10 min (not during a win or test). Changed art is reloaded fresh.
- **API:**
  - `use`, `has`, `hasTest`, `ready`, `ensure(code, forTest)`, `drawReal`, `overlay`, `covers`.
  - `play(code)` (waits for load, then 10 s), `stop`, `seek(t)`, `active`, `roar`, `synthRoar`, `ST`, `status()`, `M`.
  - Constants: `PREFETCH_AT`, `KEEP`.
- **Winner tab:**
  - New status line `#waArt`.
  - Dropdown: ★ = poster, ☆ = kit, "(kit test)" = test only.
  - Style and roar controls unchanged. localStorage keys unchanged: `flagsrumble-winart-v1`, `flagsrumble-winart-roar`.

**Vercel**
- `vercel.json`:
  - `/winart/:dir(c|kits|bg)/:path*` → `max-age=31536000, immutable`. Safe because file names carry the content hash.
  - `/winart/manifest.js` → `max-age=0, must-revalidate`.
- `.vercelignore`: `tools`, `*.zip`, `HANDOVER*`.

**Sizes**
- Russia: 474 KB in 5 files (was 1.08 MB of base64 in the HTML).
- The demo kit: 247 KB, plus a 178 KB background shared by all its countries.
- 100 posters ≈ 48 MB in the repo. Fine for GitHub and for Vercel's static limits.

**Current content**
- RU poster.
- `demo` kit, cut from Russia's pieces: shade map with the chest eagle patched out of the flag, plate = Russia's title with the name band and ball cleared.
- `demo-ru` background.
- JM, AD, FJ, IS mapped **test-only**. They look Russian (Kremlin, eagle on the bear's harness), so remove them with `winart_pack.py unmap` once real kits exist.


## 2b. v3 — layout B cards (A tier) and beast sounds
**Status**
- 14 A-tier cards are live:
  - BD tiger
  - BR jaguar
  - CN, JP, VN dragon
  - EG falcon
  - DE, MX, PH, US eagle
  - IN, NG lion
  - ID garuda
  - PK snow leopard
- Shaunak supplied fixed versions of PK, DE, MX and BR.
- Still to come: **GB** (missing) and a **new RU poster** in layout B. RU still uses the old layout and its art.

**Layout B poster**
- 941×1672.
- Beast upper-left, warrior centre with the flag pole in the right hand, flag upper-right.
- Title emblem + "<COUNTRY> SURVIVES" + "FLAGS WAR ARENA" + stats bar ("LASTED mm:ss ◆ n CAREER WINS ◆ NEXT DRAW IN nS").
- No top HUD, no flag grid.
- Shaunak confirmed: live values = the stats bar only.

**How a card is cut** (folder per country, tools in `tools/cut/`, prompts in `tools/art-src/<CODE>/prompts.json`)
1. `python3 sam.py CODE beast warrior pole flag title`, one process per job: SAM uses about 6 GB, so never run two at once, and never run SAM alongside Playwright.
   - Prompts are in poster px: `["box",x0,y0,x1,y1]` and `["pt",x,y,1|0]`.
   - Tune them with `grid.py CODE` (ruler view) and `overlay.py CODE beast,warrior,pole,flag`.
2. `python3 build_card.py CODE`, with per-card settings in `cfg.json`:
   - `beast`, `cls` (cat|bird|dragon), `mouth`, `pivot`, `dir` (-1 faces left, +1 faces right).
   - `fx` (mist|fire|lightning|wind), `color`, `amb` (embers|petals) and `petal`.
   - `stats` = the y-band of the stats bar.

   The script cleans the masks (the beast gets a big close and hole fill so open mouths stay solid). It fills in the hidden beast edges behind the warrior and the cloth behind the hand, and builds the bg plate. It finds the stats text (longest run of white rows), erases it, and records its centre, size and width. Output: `winart_<code>.json` + `V_bg.png` + `check.png`.
3. `python3 tools/winart_pack.py poster CODE CODE/winart_<code>.json --bg CODE/V_bg.png`. A `cls` key means layout B: the manifest entry gets `layout:'B'`, the text spots, and the cls / fx / color / amb / petal / dir values.
4. `python3 tools/build_html.py <kit source html>` → `index.html`.
5. Test with Playwright:
   - `WINART.play(c)`, then `seek(t-0.25)`, wait 250 ms, then `seek(t,true)`. `seek(t,true)` freezes the frame for screenshots.
   - Particles only spawn while time moves, so frozen frames under-show fire and feathers.

**Runtime (`drawB` in winart_module.js)**
- Same beats as Russia, but:
  - The beast **materialises in place**: a glow aura plus an additive glow copy, scaling 1.07 → 1 over 1.0–1.9 s, and no slide.
  - The stats bar is drawn live, scaled to the poster's measured text width.
  - Flashes and rings are tinted with the card colour.
- `beastPose()` motion per beast:
  - cat (lion, tiger): surge plus head shake.
  - jaguar: 5 grunt pulses.
  - leopard: lunge.
  - bird: wing beats. The beast layer is drawn in vertical strips, bent more toward the tips (`drawBeastB`).
  - dragon: lunge and sway.
- FX: mist puffs, fire particles from the mouth along `dir`, red lightning bolts (`bolt()`), feather bursts.
- Ambient: embers or petals.

**Sounds**
- `SYNTH` holds lion, tiger, jaguar, leopard, eagle, falcon, garuda, dragon and bear. They are built from `growl()`, `screech()`, `noiseHit()` and `thunder()`; the JP card's lightning fx adds thunder.
- `roar(beast, fx)` plays the custom file for that beast if one is saved, otherwise the synth.
- Custom files are kept per beast in IndexedDB through `BG_DB` (kv store, key `winart-roar:<beast>`). The old localStorage `flagsrumble-winart-roar` is migrated into the bear slot.
- Panel: `#waBeast` select, test, upload and reset.
- WAV previews come from `OfflineAudioContext` (test script `t4.js ... wav`).

**Known limits (v3)**
- The beasts' hidden parts behind the flag stay in the background plate. For example: the US eagle's right wing, the dragons' body coils, and the Garuda's right wing. They don't move.
- Bird flapping is a strip bend of the whole beast layer, not separate wings.
- Particle effects were checked in headless Chrome at a low frame rate; at 60 fps they are denser.

## 2c. v4 — clean roar (warp), quick mode, silent viewer
- **Beast motion is a WebGL warp, not a cut-out.**
  - `build_card.py` writes two extra layers: `warp` (a poster crop of the beast plus 80 px of its surroundings, with region alpha) and `wmap` (a weight map at 1/4 size; 1 = moves, 0 = pinned).
  - Weight = `smoothstep(d_sky/75) * smoothstep(d_occ/26)`, where `d_occ` is the distance to the warrior / flag / title mask dilated by 9.
  - The bg plate keeps the beast; only the warrior, flag and title are inpainted.
  - At runtime, `WARP` (in winart_module.js) draws a 8 px mesh whose vertex shader applies the pose (k, rot, dx/dy, wing flap) scaled by the weight. It is used once `bgU > 0.97`; before that, the cut layer is shown on the dark stage.
  - No WebGL → the beast stays still. It is part of the bg, so it stays clean.
- **Mask priority:** the beast wins over the warrior (`warrior = SAM_warrior & ~beast_raw`). SAM's warrior mask had swallowed beast parts on PH, EG, NG and BR. The open mouth is completed with the convex hull ∩ a disk(mouth, 120).
  - **Check for every new card:** the overlap of the warrior and beast masks must be about 0, and `wcheck.png` must show the whole head and mouth bright.
- **Quick mode:** `ST.anim = 'quick'` (Winner tab "Quick pop + roar · 5 s"). The full timeline is held at 2.40 s while the whole card pops in (0.35 s, scale 0.8→1 with an overshoot). It roars at about 0.4 s and sets `CFG.WINNER_MS = 5000`. `ST.anim = 'full'` keeps 10 s.
- **Silent viewer:** `tools/build_viewer.py` builds `flags-rumble-card-viewer.html` from `tools/src/viewer_shell.html`. It has every layout-B card embedded, no audio and no game. Rebuild it after each batch.
- **Per-card settings** (beast, cls, mouth, pivot, dir, fx, color, amb, petal, stats band) are in `tools/cut/cfg.json`, and the SAM prompts are in `tools/art-src/<CODE>/prompts.json`.

## 2d. v5 — UK + tier B (16 cards), new beasts, split viewers
- **Live now:** 30 layout-B cards.
  - A: the 14 from v4 plus GB.
  - B: CA CO CD ET FR IR IT KE PL TH ZA KR ES TZ TR.
  - v6: **Argentina** (lion, "Lion Gu" pick of 11 options) and **Russia** re-done in layout B (bear; folder `RU2`, packed as RU). All 16 A + 16 B done.
  - Next batch from the audience CSV (watch hours, excluding A/B): UZ NL SA SE MY AU CL UA DZ AE DK KZ IQ CZ AZ PE.
- **2:3 posters** (1024×1536: GB CA CO CD ET KE PL ZA ES TZ) are extended to 941×1672 before cutting:
  - The poster is scaled to 941×1411 and placed at the **top**.
  - The bottom 261 px continue from the card's own last rows: each row is blurred more and fades into the card's darkest tone, plus fine grain.
  - No blurred top band (the earlier version had one; Shaunak flagged it).
  - Masks, anchors and stats rows were shifted up by 130 px.
  - Ask for 9:16 next time.
- **Thailand** uses the "Roaring Elephant" version (trunk up, mouth open).
- **New beasts** (SYNTH + beastPose):
  - haetae (KR): tiger roar + thunder.
  - wolf (IT, TR): snarl + howl; snarl-lunge motion.
  - bull (ES): snort + bellow; head toss.
  - moose (CA): deep bellow; head up.
  - elephant (TH, TZ): trumpet; head + trunk lift.
  - condor (CO): hiss + rasping cry; bird motion.
- **Builder changes:**
  - `cfg.statsRows` pins the stats text rows; auto-detect them with the white + yellow row scan.
  - `m_warrior2.png` (tight box + 2 points) overrides the first warrior cut. Used for CA IR IT TH PL; PL also gets `warriorUnionX:250` to keep the hussar wing.
  - Stray warrior components that don't touch the pole are dropped.
  - Don't add sword points to the warrior prompts: SAM grabbed background with them.
- **Viewers:** `build_viewer.py out.html A|B` (16 MB page limit). Tier A → `flags-rumble-card-viewer.html`, tier B → `flags-rumble-tier-b-viewer.html`.

## 2e. v7 — full 9:16 re-cut + 4 shared kits (every country covered)
- **Re-cut at true 9:16** (Shaunak regenerated them): AR CA CO CD ET KE PL RU ZA ES TZ GB. The 2:3 extension trick from v5 is gone; old sources in `/home/claude/cards/_old2x3/` (not shipped). RU now comes from folder `RU` (RU2 removed).
- **Manifest now:** 32 posters, 4 kits (bear, dragon, wolf, lion), 164 kitCountries. Every one of the 196 game countries has art. Demo kit + test-only mappings removed.
- **Kit layout B** (`layout:'B'` in `M.kits`): same renderer as poster cards (drawB, warp roar, beastPose, FX) plus:
  - `layers.flag` = grey shade map of the white cloth (50 % = neutral). The country flag (SVG from the game) is drawn per 4-px column between `flagCols` top/bottom, then hard-light shaded and clipped to the cloth (`makeKitFlag`).
  - `ball [cx,cy,r]`: flag cover-fit into the crest ball, multiply with the ball pixels, screen highlight, rim darkening.
  - `band [x0,y0,x1,y1]`: country name from `BY_CODE` (incl. EXTRA_NAMES), Cinzel 900 (`winart/fonts/cinzel-900.woff2`, OFL), silver gradient + dark stroke + thin gold edge, shrink-to-fit then horizontal squeeze.
  - Both are built once per country and cached (`need('kitflag:…')`, `need('kittitle:…')`).
- **Pipeline for a kit:** `tools/cut/sam.py` masks → `build_card.py KCODE` → `build_kit.py KCODE` (shade map, flagCols, ball, band; writes `kit_<code>.json` + `kitcheck.png`) → `winart_pack.py kitb <name> KCODE/kit_kcode.json --bg KCODE/V_bg.png --beast <beast>` → `winart_pack.py mapb <name> CODE…` (skips poster countries). Region lists: `tools/cut/kitmap.json`.
- **Poster replaces kit:** `winart_pack.py poster` removes the country's kitCountries entry automatically.
- **Viewers:** `build_viewer.py out.html K` = kit viewer (22 sample countries, embeds flags + Cinzel). Name lookup now includes EXTRA_NAMES. Files: `flags-rumble-card-viewer.html` (A), `flags-rumble-tier-b-viewer.html` (B), `flags-rumble-kit-viewer.html` (K).
- **Checked:** roar close-ups rest vs peak for all 12 re-cuts and 4 kits (whole head moves, warrior pinned, no seams); forced real wins for NL JM KZ SA in the game (covers()=true); t2.js regression in quick mode passes (prefetch, LRU 8, fallback card for style=current).

- **file:// fix (v7.1):** opened by double-click, Chrome taints canvases drawn from local images (getImageData in readWeights / WebGL upload threw SecurityError → every country "failed"). `decodeFile` → `localSrc(path)`: on http it's `winart/<path>`; on file:// it loads `winart-local/<path>.js` (sets `WINART_LOCAL[path]` = data URL) via a script tag. Data URLs don't taint. The Cinzel font goes the same way. `tools/winart_local.py` builds the folder (≈33 MB); `winart_pack.py` reruns it after every command. Ignored by `.gitignore` + `.vercelignore`.

## 2f. v8 — default recorded sounds, Super Chat pop, arena backgrounds
- **Sounds:** `winart/sfx/{lion,tiger,bear,elephant,eagle-scream,eagle-cry}.mp3`, trimmed to the onset, 0.15 s fade-out, gain-matched to about -16.5 dB mean. `SFX_DEF` maps each beast to [file, playbackRate]. Dragon and bull have no entry, so they keep SYNTH. Priority in `roar()`: the viewer's own file (IndexedDB) > default file > synth (only if the file isn't decoded yet). All files are preloaded 1.5 s after start (about 225 KB). On file:// they load through `localSrc` from winart-local.
- **Super Chat pop:**
  - `WINART.scPop(code, user)` is called in `CHAT.apply` for the superchat shield, revive and drop-in branches.
  - `WINART.ensure(code)` runs in `CHAT.request` as soon as a Super Chat arrives.
  - The queue holds up to 6. A pop is skipped if its art isn't ready within `SC_WAIT` = 3 s, and it never plays during WINNER.
  - Timing: it opens in 0.22 s (circle clip + back-eased scale 0.84 → 1), grows +7 %, closes from 0.95 to 1.2 s. The timeline is `QUICK_AT` + t × 1.05, so the roar peaks at about 0.45 s. `info.sound` = false.
  - `statsLine` draws "★ SUPER CHAT ◆ @handle" when `info.sc` is set.
  - `covers()` is true while the circle fills the canvas.
  - Controls: `ST.scPop`, Winner tab `#waSc` (On / Off / Test) and `#waScUser`.
  - Test helpers: `scStats()`, `scSeek(t)`, `sfx()`.
- **Pop length:** `ST.scDur` (1–3 s, default 1.0) comes from the `#waScDur` slider. The 1.2 s design is time-scaled: t = real × 1.2 / dur, and `dur` is fixed when each pop starts.
- **Late entries (tested):** a subscriber drop-in at 6 left that wins 0.4 s later, a Super Chat drop-in that wins at once, and a subscriber drop-in that wins at once all show their art (`scan()` + the `ensure` at win + `WAIT_MS` hold).
- **Arena backgrounds** shipped at the root: `bg-grass/ice/lava/desert/cosmic.jpg` (1080×1920) and `bg-original.jpg` (900×1600).
- `build_html.py` now also adds the Super Chat pop panel and the game hooks (idempotent). Rebuild with `python3 tools/build_html.py <current index.html> index.html`.

## 2g. v9 — never-stuck safety + support lines
- **Module:**
  - `drawReal`, `covers` and `overlay` are each wrapped in try/catch. On error: `oops()` (console only, throttled to 5 s), `failArt(code)` (releases the bitmaps, state 'fail'; retried after 60 s), and `show.fellBack` / preview / scCur are dropped.
  - `recover()` pops up to 64 canvas saves and resets the transform, alpha and composite, so a half-drawn frame can't leave a clip behind.
  - The exports ensure / scPop / play / stop / has / ready / roar are wrapped with `safe()`.
  - A load stuck for more than 20 s is restarted.
  - WARP: try/catch, plus webglcontextlost / restored rebuilding.
  - Sounds decode in an OfflineAudioContext, so no AudioContext is opened before the first click.
- **Game (via build_html.py, idempotent):**
  - `frame()` schedules rAF first; `tick` and `render` each get their own try/catch plus canvas recovery.
  - `COMMENTARY.special(text, low)`: a low line waits behind every special line and is dropped when a real one arrives.
  - `LIVE_LINES.promoArt` / `promoMember`.
  - `PROMO` scheduler (`onRound` from CHAT's round reset, `tick` next to `LIVESCHED.tick`).
  - Live tab switches `#promoArt` / `#promoMember`, stored in localStorage `flagsrumble-promo`.
- **Tested:** HTTP 500 art → default card. Hung art → 1.2 s hold, then default card. Simulated GPU error mid-card → default card. Error in the pop → pop skipped. Crash in drawHUD → frames continue. No page errors. In 6 quick rounds, support lines played in rounds 2/4/6 at +3.5 s and membership in rounds 3/6 at 37 left, never overlapping the chat / Super Chat / subscribe promos.
- **Fixed:** earlier rebuilds had duplicated the Full/Quick toggle row (the guard was missing). Removed; the build is now idempotent (`build_html.py index.html out` gives an identical file).

## 2h. v10 — merged Shaunak's thank-you cards + Jewels build
- His other build (thank-you cards, Jewels, StreamElements `subscription`) was based on `flags-rumble-original-before-winart.html`. It was merged with `git merge-file ours base theirs`: 74 lines and 1 conflict, at the CHAT round reset, where both `LIVECARD.list.filter(c=>c.always)` and `PROMO.onRound` were kept.
- **Pop:** `scPop(code, user, force, label)` puts the label (Jewels / New member / Gifted memberships) in the bar. `SC_DELAY` = 0.9 s so the thank-you card is seen first; `SC_WAIT` = 4 s. `scShowing()` pauses `LIVECARD.tick` while the pop is up.
- **Voice:** `LIVEVOX.say(k, c, label)` swaps "Super Chat" for the real event name in reaction lines.
- All of this is in `build_html.py` and stays idempotent.

## 2i. v11 — Jewels totals, generic champion card, upper handle banner
- **Game, `JEWELS` (via build_html.py):**
  - `CHAT.ingest` sends `kind==='jewels'` to `JEWELS.ingest` before the late / winner check.
  - The total per lower-cased handle lives in localStorage `flagsrumble-jewels` ({cfg, tally}).
  - pop = floor(total / P) went up; power = powIdx(total) went up, where powIdx(x) = x < A ? 0 : 1 + floor((x − A) / S). Defaults: P = 50, A = 200, S = 100. Changing a slider applies at once.
  - Power is requested with `noPop: true`, so the apply hooks don't fire a second pop. `noPop` / `label` are carried through `request`, `await` and `SAVED`.
  - Pops earned during WINNER wait in `JEWELS.later` and play from `onRound`.
  - The voice line `jThanks` is spoken from `scPop`'s `onStart`, only when the card actually plays.
  - The thank-you card merges per handle (`LIVECARD` item `.jw`).
- **Module:**
  - Generic card code `~G:<kit>:<@handle>`: `entry()` returns the kit, `flagSource` gives white, the ball is left as is, and the band shows the handle without the @.
  - `scPop(code, user, force, label, {onStart, onSkip})`.
  - `handleBanner()` draws at `P.hb` when `ST.scTop` is set.
- **Banner spots:** `tools/cut/handle_box.py CARDS_DIR`.
  - It writes `tools/cut/handlebox.json`, and `winart_pack.py` copies it into the manifest as `hb` on every save (`winart_pack.py resave`).
  - Cost function: beast face disk (around the mouth) ×6, warrior head (first head-wide rows + 300 px) ×6, other beast / warrior pixels ×1, pole 0.6, flag 0.35.
  - Search band: y 210 … 836 − h, keeping clear of the top ~12 % (YouTube's mobile header). Three x options.
  - **Re-run it for every new card.**
- **Tested:**
  - 40 Jewels in small gifts: one merged card, no burst, no power. At 50: one burst plus voice.
  - +150 (= 200): one burst plus a shield. +100 (= 300): one burst plus a shield.
  - No country typed: generic card; at 200 the power waits until they type a country, then shields it.
  - Gift on the winner screen: burst at the next round start.
  - Totals survive a reload.
  - Failure-injection and regression suites pass.

- **v11.1 clan banners:** `tools/cut/clan_flag.py CARDS_DIR KCODE out.png` makes a 640×480 banner: the kit beast's head, engraved in gold (CLAHE plus Laplacian lines, then a gold gradient map), soft-cut, inside a gold ring, on a dark cloth (bear crimson, dragon black, wolf navy, lion purple). Pack it with `winart_pack.py clan <kit> out.png` (manifest `kits[k].clan`; `kitb` keeps it). The generic card prints it on the cloth and in the ball.

- **v11.2 ask for a country:** `askCountry(uname, sub)` is spoken from paidEvent's no-country branch and from `lateSuper`, once per handle per 120 s. Lines: `LIVE_LINES.scNoCountry` / `subNoCountry`. Jewels use `jNeedCountry` on the champion card when power && !code. `lateSuper` with no country now parks the request in `CHAT.lateAwait`, which is re-added to `await` after the round reset. Repeated waiting Super Chats add shield layers (max 5).

- **v11.3 OBS-safe pickers:** OBS's CEF Interact window doesn't open native `<select>` popups. A script before `</body>` (`PICK_JS` in build_html.py, replaced on each build) hides every `<select>` and adds an input plus an in-page list.
  - It dispatches `focus` to the select so the existing fill functions refresh the options.
  - On pick it sets `select.value` and dispatches `change` / `input`, so all existing code still reads the select.
  - Country search uses `chatCountriesAll(chatClean(q))`, then the exact code, aliases (UK / USA / UAE / KSA / DRC), then prefix, word-prefix and substring matches.

- **v12 Smart sequence:** `PROMO` (SMART_JS in build_html.py, regenerated on every build) runs the slots.
  - `cfg.mode` is 'smart' (default) or 'classic'. `LIVESCHED.tick` returns early in smart mode.
  - `PROMO.event(kind)` is called from paidEvent and from a Jewels pop; it counts subs and paid events this round.
  - Rotation indices are kept in localStorage `flagsrumble-promo-rot`.
  - `plan()` re-plans when a switch changes; `done` keeps used slots used.
  - Slot rule: speak when no special line is busy and the voice is idle, or when the force point is reached (n ≤ 35 / 20 / 12, art at +12 s). A gone slot is skipped.
  - Spoken lines never contain handles: `scNoCountry` / `jThanks` / `jNeedCountry` were rewritten, and subscribers aren't asked aloud.

## 3. Adding a poster country (old layout, Russia-style) (repeat per country)
1. **Normalize** the poster to 941×1672 (resize any 9:16).
2. **Cut** with `tools/cut/`, as in v1:
   - `pip install rembg --break-system-packages`. SAM downloads once, about 375 MB. Run **one SAM job per process**.
   - `seg1.py` / `seg2.py` make the masks, from prompts in `points.json` / `prompts2.json`.
   - `layers.py` cleans the masks.
   - `build_vertical.py` builds the layers. Adapt the file names and the per-poster values: anchors, patch rects, and grid/text if the HUD differs.
   - Overlay-check the masks before building.
3. **Pack:**
   - `python3 tools/winart_pack.py poster JP winart_jp_vertical.json --bg V_bg.png --beast tiger`
   - It drops the Fade layers, re-encodes the bg as WebP q82 from the lossless PNG, hashes the names and updates the manifest.
   - If the poster's HUD positions differ from `layout`, add `grid` / `text` to the JSON.
4. **Test:**
   - Serve the repo folder: `python3 -m http.server`.
   - Run Playwright with `--use-gl=swiftshader`: `WINART.play('JP')`, wait for `WINART.ready`, then `seek` to 0.6 / 1.5 / 2.2 / 2.9 / 4.5 / 7 s and screenshot.
   - Compare with the poster.
5. **Deliver:** the updated `winart/` (or the whole repo zip) and a storyboard PNG.

**Kit country:**
- Make the kit once: `tools/art-src/<kit>/` with body.png, beast.png, flagshade.png (grey cloth, 50 % = neutral; build it like `demo_kit`) and plate.png, all in full-poster placement, plus `meta.json` (anchors, fade, flagCols, title).
- Then run `winart_pack.py kit <name> --dir …`, `winart_pack.py bg <name> img.png`, and `winart_pack.py map <CODE> --kit <name> --bg <name>`.
- The suggested D-tier background groups are in README.md.

## 4. NEXT WORK, in this order
- **A. Batches of posters.** A + B done (32). Next: C batch UZ NL SA SE MY AU CL UA DZ AE DK KZ IQ CZ AZ PE, then NO FI NP RO MA BE IL IE CH KG JO GR HU PT RS AT. Layout-B pipeline (section 2b/2e). Each new poster replaces its kit mapping.
- **B. Sounds per beast and proper custom-audio saving.**
  - One default synth per beast.
  - Custom files in IndexedDB (`BG_DB` has `indexedDB.open('flagsrumble',1)`): bump the version and add an `audio` store.
  - Migrate `flagsrumble-winart-roar`.
  - Use `beast` from the manifest entry.
  - Eagles: a screech plus a wing-flap / lunge motion instead of the jaw surge.
- **C. Super Chat event.**
  - 1–1.5 s; the HUD fades, and warrior + beast roar above the ring. Queue it like `LIVECARD`.
  - It needs the country's art: call `WINART.ensure(code)` the moment the Super Chat arrives and play when it's ready, or skip after about 2 s.
  - Keep the existing Super Chat logic.
- **D. Subscribe pop.**
  - 0.5–1 s warrior + beast in the prompt slot, no sound. Same `ensure` rule.
  - Respect `subSeen`.
- **E. Tests for every delivery.**
  - Manual triggers in the Winner tab, plus Test-tab injection.
  - Storyboards; no page errors.
  - Style=Current still works.
  - A forced real win (`G.winner={c:BY_CODE.get('RU'),lasted:418}; G.phase='WINNER'; G.tPhase=0`).
  - Slow-network fallback (Playwright `route` delay: 600 ms → hold then art; 3000 ms → current card).
  - WAV previews of the sounds.

## 5. Known limits (be honest about them)
- **Static poster text:** the logo, "WHERE ARE YOU FROM?" and the LIKE text are baked into the poster and don't follow the BRAND fields.
- **Moving pieces:** warrior and beast move as whole pieces; only the flag ripples.
- **Filled-in areas:** the inpainted areas show only during the 1.9–2.5 s arrival.
- **Kit name text:** Cinzel 900 silver/gold, close to but not identical to the posters' chiselled lettering.
- **Kit costume colours** stay the same for every country on that kit; only flag, ball and name change.
- **Built-in roar:** synthesised; a real recording is better.
- **Test-machine speed:** headless frame times are only relative. The JS cost of `render()` while the art plays was ~0.6 ms median and ~4 ms p95 (CPU, swiftshader).
- **Vercel Hobby plan:** meant for non-commercial use. A monetized channel may need Pro; check Vercel's fair-use terms.
