#!/usr/bin/env python3
"""Clan banner for the generic champion card: the kit's own beast, engraved in gold on a dark war banner.
   usage: python3 clan_flag.py CARDS_DIR KCODE OUT.png   (KCODE = KBEAR / KDRAGON / KWOLF / KLION)"""
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter
D, K, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(f'{D}/cfg.json'))[K]
BASE = {'KBEAR': (92, 14, 20), 'KDRAGON': (24, 8, 10), 'KWOLF': (14, 24, 52), 'KLION': (46, 16, 58)}[K]
W, H = 640, 480
P = np.asarray(Image.open(f'{D}/{K}/poster.png').convert('RGB')).astype(np.float32)
M = np.asarray(Image.open(f'{D}/{K}/m_beast.png').convert('L')).astype(np.float32) / 255
mx, my = cfg['mouth'][:2]; d = cfg.get('dir', -1)
cx, cy, R = int(mx - d * 95), int(my - 40), 250                 # the beast's head
x0, y0 = max(0, cx - R), max(0, cy - R); x1, y1 = min(941, cx + R), min(1672, cy + R)
crop, m = P[y0:y1, x0:x1], M[y0:y1, x0:x1]
m = cv2.GaussianBlur(m, (0, 0), 2.0)
yy0, xx0 = np.mgrid[y0:y1, x0:x1]; dist = np.hypot(xx0 - cx, yy0 - cy) / R
edge = np.minimum.reduce([xx0 - x0 + (x0 > 0) * 99, x1 - xx0 + (x1 < 941) * 99, yy0 - y0 + (y0 > 0) * 99, y1 - yy0 + (y1 < 1672) * 99]).astype(np.float32)
m = m * np.clip((0.97 - dist) / 0.22, 0, 1) * np.clip(edge / 40, 0, 1)   # soft round fade: no straight crop edges
L = (0.3 * crop[..., 0] + 0.59 * crop[..., 1] + 0.11 * crop[..., 2]) / 255
L = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(6, 6)).apply((L * 255).astype(np.uint8)).astype(np.float32) / 255
edges = cv2.Laplacian(cv2.GaussianBlur(L, (0, 0), 1.2), cv2.CV_32F); L = np.clip(L - 0.6 * np.abs(edges), 0, 1)   # engraved lines
stops = np.array([[38, 20, 6], [120, 72, 18], [214, 160, 58], [255, 226, 140], [255, 246, 214]], np.float32)
xs = np.linspace(0, 1, len(stops)); gold = np.stack([np.interp(L, xs, stops[:, k]) for k in range(3)], -1)
em = Image.fromarray(np.dstack([gold, m * 255]).astype(np.uint8), 'RGBA')
# banner: dark cloth with a vignette, gold double border, emblem in a gold ring
yy, xx = np.mgrid[0:H, 0:W]; v = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 0.8
cloth = np.clip(np.array(BASE, np.float32)[None, None] * v[..., None] * 1.35, 0, 255)
noise = np.random.default_rng(3).normal(0, 5, (H, W, 1)); cloth = np.clip(cloth + noise, 0, 255)
img = Image.fromarray(cloth.astype(np.uint8), 'RGB').convert('RGBA'); g = ImageDraw.Draw(img)
for i, (pad, wd) in enumerate([(14, 7), (30, 3)]): g.rectangle([pad, pad, W - pad, H - pad], outline=(222, 172, 70, 255), width=wd)
for (px, py) in [(30, 30), (W - 30, 30), (30, H - 30), (W - 30, H - 30)]: g.ellipse([px - 9, py - 9, px + 9, py + 9], fill=(240, 196, 92, 255))
rc = (W // 2, H // 2); rr = 178
ring = Image.new('RGBA', (W, H)); rg = ImageDraw.Draw(ring)
rg.ellipse([rc[0] - rr, rc[1] - rr, rc[0] + rr, rc[1] + rr], fill=(0, 0, 0, 90), outline=(232, 184, 78, 255), width=6)
rg.ellipse([rc[0] - rr + 12, rc[1] - rr + 12, rc[0] + rr - 12, rc[1] + rr - 12], outline=(170, 120, 40, 255), width=2)
img = Image.alpha_composite(img, ring)
s = (2 * rr - 34) / max(em.size); em = em.resize((int(em.size[0] * s), int(em.size[1] * s)), Image.LANCZOS)
mask = Image.new('L', (W, H)); ImageDraw.Draw(mask).ellipse([rc[0] - rr + 14, rc[1] - rr + 14, rc[0] + rr - 14, rc[1] + rr - 14], fill=255)
lay = Image.new('RGBA', (W, H)); lay.paste(em, (rc[0] - em.size[0] // 2, rc[1] - em.size[1] // 2), em)
sh = lay.split()[3].filter(ImageFilter.GaussianBlur(6)); shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); shadow.putalpha(sh.point(lambda a: int(a * 0.7)))
lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.split()[3]), np.asarray(mask))))
img = Image.alpha_composite(Image.alpha_composite(img, shadow), lay)
img.convert('RGB').save(OUT); print('wrote', OUT)
