#!/usr/bin/env python3
"""Turn a cut layout-B KIT poster (white flag, empty white ball, empty name band) into kit data.
   usage: python3 build_kit.py CODE      (after build_card.py CODE)
   reads CODE/winart_<code>.json + CODE/poster.png, writes CODE/kit_<code>.json:
     layers.flag  -> grey shade map of the white cloth (50 % grey = unchanged, darker = folds, lighter = sheen)
     flagCols     -> cloth top/bottom (poster y) every 4 px, so the country flag follows the cloth
     ball         -> [cx, cy, r] of the white ball in the crest
     band         -> [x0, y0, x1, y1] of the dark name band"""
import sys, json, io, base64, numpy as np, cv2
from PIL import Image
code = sys.argv[1]; D = code + '/'
J = json.load(open(D + f'winart_{code.lower()}.json')); cfg = json.load(open('cfg.json'))[code]
P = np.asarray(Image.open(D + 'poster.png').convert('RGB')).astype(np.float32); H, W = P.shape[:2]
dec = lambda src: np.asarray(Image.open(io.BytesIO(base64.b64decode(src.split(',', 1)[1]))).convert('RGBA')).astype(np.float32)

# ---- flag cloth -> shade map + column extents
FL = J['layers']['flag']; f = dec(FL['src']); a = f[..., 3] / 255.0; V = f[..., :3].max(-1)
m = (a > 0.5).astype(np.float32); sig = 22
low = cv2.GaussianBlur(V * m, (0, 0), sig) / (cv2.GaussianBlur(m, (0, 0), sig) + 1e-3)
sh = np.clip(0.5 * V / (low + 1), 0, 1)
shade = np.dstack([sh * 255] * 3 + [a * 255]).astype(np.uint8)
b = io.BytesIO(); Image.fromarray(shade).save(b, 'WEBP', quality=92, method=6)
FL['src'] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
h, w = a.shape; cols = []
for x in range(0, w, 4):
    ys = np.where(a[:, x:x + 4].max(1) > 0.5)[0]
    cols.append([float(np.percentile(ys, 2)), float(np.percentile(ys, 97))] if len(ys) > 10 else [np.nan, np.nan])
c = np.array(cols)
for j in range(2):
    s = c[:, j]; ok = ~np.isnan(s); s[~ok] = np.interp(np.where(~ok)[0], np.where(ok)[0], s[ok])
    c[:, j] = np.convolve(np.pad(s, 4, mode='edge'), np.ones(9) / 9, 'valid')
J['flagCols'] = [[round(t + FL['y'], 1), round(bt + FL['y'], 1)] for t, bt in c.tolist()]; J['flagColStep'] = 4

# ---- white ball in the crest: bright, low-saturation blob nearest the centre line above the band
R, G, B = P[..., 0], P[..., 1], P[..., 2]; mx, mn = P.max(-1), P.min(-1)
white = ((mn > 150) & (mx - mn < 45)).astype(np.uint8)
white[:, :300] = 0; white[:, 640:] = 0; white[:900] = 0; white[1300:] = 0
white = cv2.morphologyEx(white, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
n, lab, st, cen = cv2.connectedComponentsWithStats(white, 8)
best = max(range(1, n), key=lambda i: st[i, cv2.CC_STAT_AREA] - abs(cen[i][0] - 470) * 20)
x, y, ww, hh, area = st[best]
# the bright blob is only the lit top of the ball: march rays out to the gold rim and fit a circle
cx0, cy0 = x + ww / 2, y + hh / 2 + 0.25 * hh; sat = mx - mn
for _pass in range(2):
  pts = []
  for ang in np.linspace(0, 2 * np.pi, 180, endpoint=False):
    for rr in np.arange(20, 150, 0.5):
        xi, yi = int(round(cx0 + rr * np.cos(ang))), int(round(cy0 + rr * np.sin(ang)))
        if sat[yi, xi] > cfg.get('ballSat', 120) or mx[yi, xi] < 60: pts.append((xi, yi)); break
  pts = np.array(pts, float)
  for _ in range(3):
    A = np.c_[2 * pts[:, 0], 2 * pts[:, 1], np.ones(len(pts))]
    X, Y, C = np.linalg.lstsq(A, (pts ** 2).sum(1), rcond=None)[0]; Rr = np.sqrt(C + X * X + Y * Y)
    d = np.abs(np.hypot(pts[:, 0] - X, pts[:, 1] - Y) - Rr); pts = pts[d < max(2.5, np.percentile(d, 80))]
  cx0, cy0 = X, Y
r = float(Rr) - 1.5; J['ball'] = [round(float(X), 1), round(float(Y), 1), round(r, 1)]

# ---- dark name band between the ball and SURVIVES
by = J['ball'][1] + r; L = 0.299 * R + 0.587 * G + 0.114 * B
rows = [yy for yy in range(int(by) + 20, int(by) + 260) if np.median(L[yy, 260:680]) < 32]
runs = []; st_ = None
for i, yy in enumerate(rows + [-9]):
    if st_ is None: st_ = yy; prev = yy; continue
    if yy != prev + 1: runs.append((prev - st_ + 1, st_, prev)); st_ = yy
    prev = yy
_, y0, y1 = max(runs); ym = (y0 + y1) // 2
dark = np.where(L[ym] < 40)[0]; dark = dark[(dark > 60) & (dark < W - 60)]
cx = W // 2; left = cx; right = cx
while left - 1 in set(dark) or (left - 1 > 60 and L[ym, left - 1] < 45): left -= 1
while right + 1 < W - 60 and L[ym, right + 1] < 45: right += 1
J['band'] = [int(left + 6), int(y0 + 4), int(right - 6), int(y1 - 4)]
print(code, 'ball', J['ball'], 'band', J['band'], 'flagCols', len(J['flagCols']))
json.dump(J, open(D + f'kit_{code.lower()}.json', 'w'))
# check image: ball circle + band rectangle
chk = Image.open(D + 'poster.png').convert('RGB'); from PIL import ImageDraw; d = ImageDraw.Draw(chk)
bx, byc, br = J['ball']; d.ellipse([bx - br, byc - br, bx + br, byc + br], outline=(255, 0, 0), width=3)
d.rectangle(J['band'], outline=(0, 255, 0), width=3); chk.crop((0, 900, 941, 1672)).save(D + 'kitcheck.png')
