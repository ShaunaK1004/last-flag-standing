#!/usr/bin/env python3
"""Measure the scrim the TARGET mockup applied, instead of guessing one.

bg_scrim.py showed the contrast argument does not bite: every white-text band in
this artwork is already near-black (worst 14.99:1 with no scrim at all), because
the bright parts of the photo - the shirt and the nebula - sit behind the ARENA,
not behind the header. So the scrim is a look question, and the look is specified
by the mockup Dell attached. Measure it there.

Model: mockup = (1-a)*photo + a*scrim, solved per channel by least squares over
sample blocks that lie outside BOTH rings and outside every panel, so the only
things stacked at those pixels are the photo and the scrim.
"""
import os
import numpy as np
from PIL import Image

UP = '/sessions/nifty-wonderful-euler/mnt/uploads'
photo = Image.open(f'{UP}/WhatsApp Image 2026-08-25 at 8.04.27 PM.jpeg').convert('RGB')
mock = Image.open(f'{UP}/Screenshot 2026-08-25 203429.png').convert('RGB')
print(f'photo {photo.size}  mockup {mock.size}')

W, H = 1080, 1920
P = np.asarray(photo.resize((W, H), Image.LANCZOS), dtype=np.float64)
M = np.asarray(mock.resize((W, H), Image.LANCZOS), dtype=np.float64)
print(f'both resampled to {W}x{H}  (mockup aspect {mock.width/mock.height:.4f} vs '
      f'{W/H:.4f}: a {100*abs(mock.width/mock.height-W/H)/(W/H):.1f}% stretch, '
      f'tolerable for block means)')

# my ring: centre (540,860) r 483.  mockup ring, measured off the screenshot and
# scaled: centre (539,930) r 467.  Sample only where neither ring nor any panel is.
def clear(x, y, r=40):
    for cx, cy, rr in ((540, 860, 483 + 30), (539, 930, 467 + 30)):
        if (x - cx) ** 2 + (y - cy) ** 2 < (rr + r) ** 2:
            return False
    return not (y < 230 or y > 1660)     # header row / lower stack have panels

BLK = 36
samples = []
for y in range(240, 1660, 60):
    for x in range(14, W - 14, 60):
        if clear(x, y, BLK):
            p = P[y:y + BLK, x:x + BLK].reshape(-1, 3).mean(0)
            m = M[y:y + BLK, x:x + BLK].reshape(-1, 3).mean(0)
            samples.append((p, m))
print(f'{len(samples)} clear sample blocks of {BLK}x{BLK}')

p = np.array([s[0] for s in samples])
m = np.array([s[1] for s in samples])

# least squares m = k*p + c  per channel; then a = 1-k and scrim = c/a
print('\nper channel fit  mockup = k*photo + c :')
ks, cs = [], []
for i, ch in enumerate('RGB'):
    A = np.stack([p[:, i], np.ones(len(p))], 1)
    (k, c), res, *_ = np.linalg.lstsq(A, m[:, i], rcond=None)
    rms = float(np.sqrt(np.mean((A @ [k, c] - m[:, i]) ** 2)))
    ks.append(k); cs.append(c)
    print(f'  {ch}:  k={k:.4f}  c={c:+.2f}   -> alpha {1-k:.3f}   rms residual {rms:.2f}/255')

k = float(np.mean(ks))
a = 1 - k
print(f'\nmean k over channels = {k:.4f}  ->  scrim alpha = {a:.3f}')
if a > 0.02:
    scrim = [c / a for c in cs]
    print(f'implied scrim colour = rgb({scrim[0]:.0f},{scrim[1]:.0f},{scrim[2]:.0f})')
else:
    print('alpha is within noise of zero: the mockup applies NO global scrim')

# how bright is the photo where the mockup is brightest outside the ring?
print(f'\nsanity: mean photo {p.mean(0).round(1)}   mean mockup {m.mean(0).round(1)}')
print(f'        max  photo {p.max(0).round(1)}   max  mockup {m.max(0).round(1)}')

# ---- and the arena floor: how much does the mockup dim INSIDE the ring? -------
# sample inside the mockup ring but away from balls/hub: an annulus at r 300-430
# from the mockup centre, and read the same photo pixels.
ins = []
for ang in np.arange(0, 2 * np.pi, 0.06):
    for rr in (300, 340, 380, 420):
        x = int(539 + np.cos(ang) * rr); y = int(930 + np.sin(ang) * rr)
        if 20 < x < W - 20 and 20 < y < H - 20:
            ins.append((P[y, x], M[y, x]))
pi = np.array([s[0] for s in ins]); mi = np.array([s[1] for s in ins])
# balls are opaque and bright: keep only the darkest 40% of mockup samples, i.e. floor
keep = np.argsort(mi.sum(1))[:int(len(mi) * 0.40)]
pi, mi = pi[keep], mi[keep]
print(f'\ninside-ring floor: {len(pi)} darkest-40% annulus samples (balls excluded by rank)')
kk = []
for i, ch in enumerate('RGB'):
    A = np.stack([pi[:, i], np.ones(len(pi))], 1)
    (k2, c2), *_ = np.linalg.lstsq(A, mi[:, i], rcond=None)
    kk.append(k2)
    print(f'  {ch}:  k={k2:.4f}  c={c2:+.2f}   -> floor alpha {1-k2:.3f}')
print(f'mean floor alpha = {1-float(np.mean(kk)):.3f}   '
      f'(current build outer stop is 0.85)')
