#!/usr/bin/env python3
"""Build winart-viewer.html: a silent, stand-alone page that plays the winner-card animations only
(no game, no commentary, no audio). All art is embedded, so the one file works anywhere.
usage: python3 tools/build_viewer.py [out]"""
import os, sys, json, base64, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'winart-viewer.html')
man = json.load(open(os.path.join(ROOT, 'winart', 'manifest.json')))
TIER_A = ['CN','IN','US','ID','BR','RU','JP','NG','MX','BD','DE','PK','PH','VN','EG','GB']
tier = sys.argv[2].upper() if len(sys.argv) > 2 else None                  # 'A' / 'B' / none = all
KIT_SAMPLE = ['NL','SE','UA','GR','PT','KZ','UZ','MY','NP','MN','SA','MA','GH','AE','DZ','IQ','CL','AU','PE','JM','CU','FJ']
if tier == 'K':
    posters = {}
    kits = {k: v for k, v in man['kits'].items() if v.get('layout') == 'B'}
    kc = {c: e for c, e in man['kitCountries'].items() if e.get('kit') in kits and c in KIT_SAMPLE}
else:
    posters = {k: v for k, v in man['posters'].items() if v.get('layout') == 'B' and (tier is None or (k in TIER_A) == (tier == 'A'))}
    kits, kc = {}, {}
emb_man = {'format': man['format'], 'layout': man['layout'], 'updated': man['updated'], 'posters': posters, 'kits': kits, 'bgs': {}, 'kitCountries': kc}
files = {}
for e in list(posters.values()) + list(kits.values()):
    for L in e['layers'].values():
        files[L['f']] = 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(ROOT, 'winart', L['f']), 'rb').read()).decode()

game = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
fonts = '\n'.join(l.strip() for l in game.splitlines() if "@font-face{font-family:'FR Poppins'" in l)

mod = open(os.path.join(ROOT, 'tools', 'src', 'winart_module.js'), encoding='utf-8').read()
def patch(a, b):
    global mod
    assert a in mod, a[:60]; mod = mod.replace(a, b, 1)
patch("  function readManifest(first){", "  function readManifest(first){ if (window.WINART_EMBED){ if (!M){ M=window.WINART_EMBED.manifest; mStatus='ok'; } return; }")
patch("  function decodeFile(path){", """  function decodeFile(path){
    if (window.WINART_EMBED) return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>{ (window.createImageBitmap?createImageBitmap(im):Promise.resolve(im)).then(res,()=>res(im)); }; im.onerror=()=>rej(new Error('missing '+path)); im.src=window.WINART_EMBED.files[path]; });""")
patch("info:{ code, preview:true,", "info:{ code, preview:false,")
patch("  return { sfx:", "  return { time: ()=>preview ? (preview.frozen!=null ? preview.frozen : (preview.t0!=null ? (now()-preview.t0)/1000 : 0)) : null, sfx:")

names = {'BD':'Bangladesh','BR':'Brazil','CN':'China','DE':'Germany','EG':'Egypt','ID':'Indonesia','IN':'India','JP':'Japan','MX':'Mexico','NG':'Nigeria',
         'PH':'Philippines','PK':'Pakistan','US':'USA','VN':'Vietnam','GB':'United Kingdom','CA':'Canada','CO':'Colombia','CD':'DR Congo','ET':'Ethiopia',
         'FR':'France','IR':'Iran','IT':'Italy','KE':'Kenya','PL':'Poland','TH':'Thailand','ZA':'South Africa','KR':'South Korea','ES':'Spain','TZ':'Tanzania','TR':'Turkey','AR':'Argentina','RU':'Russia'}
import re as _re
cm = _re.search(r"const F = \(name.*?\n(const COUNTRIES = \[.*?\n\];)", game, _re.S)
allnames = dict(_re.findall(r"F\('([^']+)','([A-Z]{2})'", game))
allnames = {v: k for k, v in allnames.items()}
_ex = _re.search(r"const EXTRA_NAMES = (\{.*?\});", game)
if _ex: allnames.update(json.loads(_ex.group(1)))
for c in kc: names[c] = allnames.get(c, c).title()
names = {k: v for k, v in names.items() if k in posters or k in kc}
flags_js = ''
if kc:
    fm = _re.search(r"const FLAG_SVG=(\{.*?\});\n", game, _re.S); FS = json.loads(fm.group(1))
    sub = {c.lower(): FS[c.lower()] for c in kc if c.lower() in FS}
    flags_js = ('const FLAG_SVG=' + json.dumps(sub) + ';\nwindow.FLAGS_READY=Promise.all(Object.keys(FLAG_SVG).map(k=>new Promise(res=>{'
                'const svg=FLAG_SVG[k].replace("<svg ","<svg width=\\"640\\" height=\\"480\\" preserveAspectRatio=\\"none\\" ");'
                'const im=new Image(); im.onload=()=>{FLAG_IMG[k]=im;res();}; im.onerror=()=>res(); im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);})));')
font_uri = 'data:font/woff2;base64,' + base64.b64encode(open(os.path.join(ROOT, 'winart', 'fonts', 'cinzel-900.woff2'), 'rb').read()).decode()
html = open(os.path.join(ROOT, 'tools', 'src', 'viewer_shell.html'), encoding='utf-8').read()
html = html.replace('/*TITLE*/', {'A': 'Flags Rumble Card Viewer', 'B': 'Flags Rumble Tier B Viewer', 'K': 'Flags Rumble Kit Viewer'}.get(tier, 'Flags Rumble Card Viewer'))
html = html.replace('/*FLAGS*/', flags_js)
html = html.replace('/*FONTS*/', fonts)
html = html.replace('/*EMBED*/', 'window.WINART_EMBED=' + json.dumps({'manifest': emb_man, 'files': files, 'font': font_uri if kc else None}, separators=(',', ':')) + ';')
html = html.replace('/*NAMES*/', json.dumps(names))
html = html.replace('/*MODULE*/', mod)
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, round(len(html) / 1048576, 2), 'MB,', len(posters) + len(kc), 'cards')
