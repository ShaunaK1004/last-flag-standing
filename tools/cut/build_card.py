#!/usr/bin/env python3
"""Cut one layout-B winner card (title + logo + stats bar) into animation layers from its SAM masks.
   usage: python3 build_card.py CODE      (reads CODE/poster.png, CODE/m_*.png, CODE/prompts.json, cfg.json)
   writes CODE/winart_<code>.json (data-URI layers, like build_vertical.py), CODE/V_bg.png, CODE/check.png"""
import sys, json, io, base64, numpy as np, cv2
from PIL import Image
code = sys.argv[1]; D = code + '/'
cfg = json.load(open('cfg.json'))[code]; prompts = json.load(open(D + 'prompts.json'))
P = np.array(Image.open(D + 'poster.png').convert('RGB')); H, W = P.shape[:2]
M = lambda n: (np.array(Image.open(D + f'm_{n}.png').convert('L')) > 127).astype(np.uint8)
K = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))

def clean(m, min_area=1200, close=5, hole=3000):
    if close: m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, K(close))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8); out = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= min_area: out[lab == i] = 1
    inv = (1 - out).astype(np.uint8); n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n2):
        x, y, w, h, a = st2[i]
        if a < hole and x > 0 and y > 0 and x + w < W and y + h < H: out[lab2 == i] = 1
    return out

def box_of(name): return next(p for p in prompts[name] if p[0] == 'box')[1:5]
def clip_box(m, name, pad=0):
    x0, y0, x1, y1 = box_of(name); o = np.zeros_like(m); o[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad] = 1; return m & o

title = clean(clip_box(M('title'), 'title', 6), 3000)
pole = clean(clip_box(M('pole'), 'pole', 4), 300, 3)
beast_raw = clean(clip_box(M('beast'), 'beast'), 2500, 3, 4000)   # SAM's beast wins where the warrior mask grabbed beast pixels
import os
if os.path.exists(D + 'm_warrior2.png'):                              # tighter re-cut of the warrior
    wsrc = M('warrior2')
    if cfg.get('warriorUnionX') is not None:                         # plus parts of the first cut right of x (e.g. hussar wings)
        extra = clip_box(M('warrior'), 'warrior', 6).copy(); extra[:, :cfg['warriorUnionX']] = 0; wsrc = wsrc | extra
else:
    wsrc = clip_box(M('warrior'), 'warrior', 6)
warrior = clean((wsrc & (1 - beast_raw)) | pole, 2500, 5)
warrior = (warrior & (1 - title)).astype(np.uint8)
n_w, lab_w, st_w, _ = cv2.connectedComponentsWithStats(warrior, 8)      # keep the warrior itself, drop stray background bits
if n_w > 2:
    big = 1 + int(np.argmax(st_w[1:, cv2.CC_STAT_AREA])); keepw = np.zeros_like(warrior)
    for i in range(1, n_w):
        if i == big or (pole[lab_w == i]).any(): keepw[lab_w == i] = 1
    warrior = keepw
flag = clean(clip_box(M('flag'), 'flag', 6), 2500, 5)
flag = (flag & (1 - title) & (1 - cv2.dilate(pole, K(3)))).astype(np.uint8)
warrior = (warrior & (1 - flag) | pole).astype(np.uint8) & (1 - title)
beast = clean(clip_box(M('beast'), 'beast'), 2500, 25, 60000)   # big close + hole fill: keep the open mouth
beast = (beast & (1 - warrior) & (1 - flag) & (1 - title)).astype(np.uint8)
# open mouth: teeth / tongue that sit in the mouth's notch belong to the head (convex hull near the mouth)
mx_, my_ = cfg['mouth']; yy0, xx0 = np.mgrid[0:H, 0:W]; near = ((xx0 - mx_) ** 2 + (yy0 - my_) ** 2) < 150 ** 2
pts = np.column_stack(np.where((beast & near.astype(np.uint8)) > 0))[:, ::-1].astype(np.int32)
if len(pts) > 20:
    hull = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
    beast = (beast | (hull & (((xx0 - mx_) ** 2 + (yy0 - my_) ** 2) < 120 ** 2).astype(np.uint8))).astype(np.uint8)
    beast = (beast & (1 - warrior) & (1 - flag) & (1 - title)).astype(np.uint8)
print(code, 'areas', {k: int(v.sum()) for k, v in dict(title=title, warrior=warrior, flag=flag, beast=beast).items()})

# ---- beast: fill the part hidden behind the warrior / flag near its edge so the roar surge shows no gaps
beast_rgb = P.copy(); beast_a = beast.astype(np.float32)
# soft edge where SAM's prompt box cut the beast (not at the poster border): a dragon's body runs on behind
bx0, by0, bx1, by1 = box_of('beast'); ramp = np.ones((H, W), np.float32); yy, xx = np.mgrid[0:H, 0:W]
for edge, d in ((bx0 > 2, xx - bx0), (by0 > 2, yy - by0), (bx1 < W - 2, bx1 - xx), (by1 < H - 2, by1 - yy)):
    if edge: ramp = np.minimum(ramp, np.clip(d / 45.0, 0, 1))
beast_a = beast_a * ramp

# ---- warp patch: the beast + a margin of its own surroundings, bent smoothly at runtime (no cut edges).
# weight 1 deep inside, falling to 0 at the patch edge and at the warrior / flag / title, which pin it.
occl = cv2.dilate(warrior | flag | title, K(9))
region0 = cv2.dilate(beast, K(161))                         # beast + 80 px of its own surroundings
region = (region0 & (1 - occl)).astype(np.uint8)
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(region, 8)
keep = np.zeros_like(region)
for i in range(1, n_):
    if (beast[lab_ == i]).sum() > 500: keep[lab_ == i] = 1
region = keep
ss = lambda u: (lambda v: v * v * (3 - 2 * v))(np.clip(u, 0, 1))
PAD = 140; rp = cv2.copyMakeBorder(region0, PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE)
d_sky = cv2.distanceTransform(rp, cv2.DIST_L2, 5)[PAD:-PAD, PAD:-PAD]   # soft falloff into the open sky
d_occ = cv2.distanceTransform((1 - occl).astype(np.uint8), cv2.DIST_L2, 5)  # thin pin band at warrior / flag / title
wgt = ss(d_sky / 75.0) * ss(d_occ / 26.0) * region
ys_, xs_ = np.where(region > 0); wx0, wx1, wy0, wy1 = xs_.min(), xs_.max() + 1, ys_.min(), ys_.max() + 1
ra = np.clip(cv2.GaussianBlur(region.astype(np.float32), (0, 0), 1.2) * 1.3, 0, 1) * region
warp_img = np.dstack([P, (ra * 255).astype(np.uint8)])[wy0:wy1, wx0:wx1]
wsm = wgt[wy0:wy1, wx0:wx1]; wsm = cv2.resize(wsm, ((wx1 - wx0 + 3) // 4, (wy1 - wy0 + 3) // 4), interpolation=cv2.INTER_AREA)
wmap = np.dstack([(wsm * 255).astype(np.uint8)] * 3)

# ---- flag: fill what the warrior's hand / pole covers inside the cloth so the ripple shows no holes
flag_rgb = P.copy(); fh = (cv2.dilate(flag, K(25)) & warrior).astype(np.uint8)
fs = cv2.inpaint(P.copy(), (fh | (1 - flag)).astype(np.uint8) & cv2.dilate(flag, K(41)) & (1 - flag), 5, cv2.INPAINT_TELEA)
flag_rgb[fh == 1] = fs[fh == 1]; flag_a = (flag | (fh & cv2.dilate(flag, K(9)))).astype(np.float32)

# ---- background plate: characters + title filled in (only seen for a moment), live stats text removed
hole = cv2.dilate(warrior | flag | title, K(5))
small = cv2.resize(P, (W // 4, H // 4), interpolation=cv2.INTER_AREA); hs = cv2.resize(hole, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST)
fill = cv2.GaussianBlur(cv2.resize(cv2.inpaint(small, hs, 9, cv2.INPAINT_TELEA), (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
hb = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
bg = (P * (1 - hb) + fill * hb).astype(np.uint8)
# stats bar text: bright white / yellow glyphs inside the bar
sy0, sy1 = cfg['stats']; band = P[sy0:sy1].astype(np.int32); R, G, B = band[..., 0], band[..., 1], band[..., 2]
white = ((R > 195) & (G > 195) & (B > 185) & (np.abs(R - B) < 50)).astype(np.uint8)
yellow = ((R > 210) & (G > 180) & (B < 120)).astype(np.uint8)
white[:, :105] = 0; white[:, W - 105:] = 0; yellow[:, :105] = 0; yellow[:, W - 105:] = 0
if cfg.get('statsRows'):                                       # rows given (tier B onwards)
    r0_, r1_ = cfg['statsRows']; on = np.zeros(sy1 - sy0, bool); on[r0_ - sy0:r1_ - sy0 + 1] = True
else:
    rc = white.sum(1); on = rc > rc.max() * 0.18
runs = []; st = None
for i, v in enumerate(list(on) + [False]):
    if v and st is None: st = i
    if not v and st is not None: runs.append((i - st, st, i - 1)); st = None
_, r0, r1 = max(runs); rows = np.arange(r0, r1 + 1)
ty0, ty1 = int(rows.min()) + sy0, int(rows.max()) + sy0
cc = (white + yellow)[rows.min():rows.max() + 1].sum(0); cols = np.where(cc > 0)[0]
tx0, tx1 = int(cols.min()), int(cols.max())
patch = np.zeros((H, W), np.uint8); patch[ty0 - 4:ty1 + 5, tx0 - 6:tx1 + 7] = 1
bg = cv2.inpaint(bg, patch, 5, cv2.INPAINT_TELEA)
cap = ty1 - ty0 + 1
stats = {'cx': (tx0 + tx1) / 2, 'cy': (ty0 + ty1) / 2 + 0.5, 'w': tx1 - tx0, 'size': round(cap * 1.4, 1)}
print(code, 'stats', stats)

def rgba(rgb, a, feather=1.2):
    a = np.clip(cv2.GaussianBlur(a.astype(np.float32), (0, 0), feather) * 1.15, 0, 1); return np.dstack([rgb, (a * 255).astype(np.uint8)])
layers = {'body': rgba(P, warrior), 'flag': rgba(flag_rgb, flag_a, 0.8), 'bear': rgba(beast_rgb, beast_a, 1.6), 'title': rgba(P, title, 1.0)}
def enc(img, fmt, q):
    b = io.BytesIO(); Image.fromarray(img).save(b, fmt, quality=q, **({'method': 6} if fmt == 'WEBP' else {})); return b.getvalue()
cols_t = np.where(title[:, 300:640].sum(1) > 20)[0]; t_top = int(cols_t.min())
by = np.where(beast.sum(1) > 30)[0]; b_bot = int(by.max())
fx = np.where(warrior[t_top - 40:t_top].sum(0) > 0)[0]
pole_x = int(np.median(np.where(pole[:200].sum(0) > 0)[0])) if pole[:200].sum() else int(np.median(np.where(pole.sum(0) > 0)[0]))
out = {'w': W, 'h': H, 'layers': {}, 'beast': cfg['beast'], 'cls': cfg['cls'], 'fx': cfg['fx'], 'color': cfg['color'], 'amb': cfg['amb'],
       'petal': cfg.get('petal'), 'dir': cfg['dir'], 'enter': 'materialize',
       'anchors': {'mouth': cfg['mouth'], 'bearPivot': cfg['pivot'], 'feet': [int(np.median(fx)) if len(fx) else 470, t_top], 'pole': [pole_x, 0]},
       'fade': {'body': [t_top - 30, t_top + 60], 'beast': [b_bot - 150, b_bot - 10]},
       'grid': None, 'text': {'stats': [stats['cx'], stats['cy']], 'statsSize': stats['size'], 'statsW': stats['w']}}
for k, img in layers.items():
    a = img[..., 3]; ys, xs = np.where(a > 4); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    d = enc(img[y0:y1, x0:x1], 'WEBP', 86); out['layers'][k] = {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode()}
d = enc(warp_img, 'WEBP', 88); out['layers']['warp'] = {'x': int(wx0), 'y': int(wy0), 'w': int(wx1 - wx0), 'h': int(wy1 - wy0), 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode()}
b_ = io.BytesIO(); Image.fromarray(wmap).save(b_, 'WEBP', lossless=True); d = b_.getvalue()
out['layers']['wmap'] = {'x': int(wx0), 'y': int(wy0), 'w': int(wx1 - wx0), 'h': int(wy1 - wy0), 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode()}
Image.fromarray((np.dstack([P * 0.35 + 0.65 * np.dstack([wgt * 255] * 3)])).astype(np.uint8)).resize((W * 2 // 5, H * 2 // 5)).save(D + 'wcheck.png')
d = enc(bg, 'JPEG', 92); out['layers']['bg'] = {'x': 0, 'y': 0, 'w': W, 'h': H, 'src': 'data:image/jpeg;base64,' + base64.b64encode(d).decode()}
Image.fromarray(bg).save(D + 'V_bg.png')
json.dump(out, open(D + f'winart_{code.lower()}.json', 'w'))
# check sheet: poster | bg | layers on grey
chk = np.full((H, W, 3), 60, np.uint8).astype(np.float32)
for k in ('bear', 'body', 'flag', 'title'):
    L = layers[k]; a = L[..., 3:4] / 255.0; chk = chk * (1 - a) + L[..., :3] * a
sheet = np.concatenate([P, bg, chk.astype(np.uint8)], 1)
Image.fromarray(sheet).resize((sheet.shape[1] * 2 // 5, H * 2 // 5)).save(D + 'check.png')
print(code, 'anchors', out['anchors'], 'fade', out['fade'])
