#!/usr/bin/env python3
"""Pick where the viewer's @handle banner goes on each champion card (upper half, away from faces).
   usage: python3 handle_box.py CARDS_DIR [CODE ...]      (CARDS_DIR holds CODE/poster.png + m_*.png masks)
   writes tools/cut/handlebox.json  {CODE or kit name: [x, y, w, h]} in poster pixels (941 x 1672);
   winart_pack.py copies it into the manifest as  hb  on every save."""
import sys, os, json, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1]; cfg = json.load(open(os.path.join(D, 'cfg.json')))
codes = sys.argv[2:] or sorted(c for c in cfg if os.path.isdir(os.path.join(D, c)) and os.path.exists(os.path.join(D, c, 'm_beast.png')))
KIT = {'KBEAR': 'bear', 'KDRAGON': 'dragon', 'KWOLF': 'wolf', 'KLION': 'lion'}
BW, BH, S = 600, 108, 4                                   # banner size (poster px), working scale 1/4
out_p = os.path.join(HERE, 'handlebox.json'); out = json.load(open(out_p)) if os.path.exists(out_p) else {}
def mask(c, n):
    p = os.path.join(D, c, 'm_' + n + '.png')
    if not os.path.exists(p): return None
    return np.asarray(Image.open(p).convert('L').resize((941 // S, 1672 // S))) > 127
for c in codes:
    beast, war, flag, pole = mask(c, 'beast'), mask(c, 'warrior'), mask(c, 'flag'), mask(c, 'pole')
    w2 = mask(c, 'warrior2'); war = w2 if w2 is not None else war
    h, w = beast.shape; yy, xx = np.mgrid[0:h, 0:w]
    mx, my = cfg[c]['mouth'][:2]; d = cfg[c].get('dir', -1)
    fx, fy = (mx - d * 50) / S, (my - 45) / S                          # beast face: around the mouth, toward the eyes
    face = ((xx - fx) ** 2 + (yy - fy) ** 2) < (210 / S) ** 2
    rows = np.where(war.sum(1) > 70 / S)[0]; y0 = rows[0]               # first row as wide as a head (skips spear / plume tips)
    band = war[y0:y0 + 230 // S]; cols = np.where(band.any(0))[0]
    x0, x1 = np.percentile(cols, 10), np.percentile(cols, 90)
    head = (yy >= y0 - 30 // S) & (yy < y0 + 300 // S) & (xx >= x0 - 40 // S) & (xx <= x1 + 40 // S)
    cost = 6.0 * (face & beast) + 3.0 * face + 6.0 * head + 1.0 * beast + 1.0 * war + 0.35 * (flag if flag is not None else 0) + 0.6 * (pole if pole is not None else 0)
    ii = cost.cumsum(0).cumsum(1); ii = np.pad(ii, ((1, 0), (1, 0)))
    bw, bh = BW // S, BH // S; best = None
    for y in range(210 // S, 836 // S - bh, 2):                   # below the top ~12 % (YouTube mobile header), inside the upper half
        for x in sorted({(w - bw) // 2, 20 // S, w - bw - 20 // S}):
            s = ii[y + bh, x + bw] - ii[y, x + bw] - ii[y + bh, x] + ii[y, x] + y * 0.02
            if best is None or s < best[0]: best = (s, x, y)
    _, x, y = best; key = KIT.get(c, c); out[key] = [int(x * S), int(y * S), BW, BH]
    print(f'{c:8} -> {key:7} handle box {out[key]}')
json.dump(out, open(out_p, 'w'), indent=1)
