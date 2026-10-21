#!/usr/bin/env python3
"""Make winart-local/: the same art as winart/, wrapped as small .js files.
   Only used when index.html is opened by double-click (file://). Chrome won't let a page read the
   pixels of local image files, but it does allow pictures that come from a script as data URLs.
   The live site (http/https, Vercel) never uses this folder; .vercelignore and .gitignore skip it.
   usage: python3 tools/winart_local.py        (winart_pack.py runs it after every change)"""
import os, json, base64, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA, OUT = os.path.join(ROOT, 'winart'), os.path.join(ROOT, 'winart-local')
MIME = {'.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'}

def build():
    m = json.load(open(os.path.join(WA, 'manifest.json')))
    paths = {'fonts/cinzel-900.woff2'}
    for e in list(m['posters'].values()) + list(m['kits'].values()):
        paths |= {L['f'] for L in e['layers'].values()}
        if e.get('clan'): paths.add(e['clan']['f'])
    paths |= {e['f'] for e in m.get('bgs', {}).values()}
    sfx = os.path.join(WA, 'sfx')
    if os.path.isdir(sfx): paths |= {'sfx/' + f for f in os.listdir(sfx) if f.endswith('.mp3')}
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    total = 0
    for p in sorted(paths):
        src = os.path.join(WA, p)
        if not os.path.isfile(src): continue
        uri = 'data:%s;base64,%s' % (MIME.get(os.path.splitext(p)[1], 'application/octet-stream'), base64.b64encode(open(src, 'rb').read()).decode())
        dst = os.path.join(OUT, p + '.js'); os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'w') as f: f.write('(window.WINART_LOCAL=window.WINART_LOCAL||{})[%s]="%s";\n' % (json.dumps(p), uri))
        total += os.path.getsize(dst)
    print(f'winart-local: {len(paths)} files, {total/1e6:.1f} MB (local double-click testing only)')

if __name__ == '__main__': build()
