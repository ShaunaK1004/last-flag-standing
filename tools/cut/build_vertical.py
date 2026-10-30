# Full-poster (vertical 9:16) layers for the Flags Rumble winner screen. Same masks as the 16:9 version,
# placed in full-poster coordinates, plus the pole/flag top, plus inpainted patches where live numbers go.
import numpy as np, cv2, json, base64, io
from PIL import Image
P = np.array(Image.open('ru_poster.png').convert('RGB')); H, W = P.shape[:2]; Y0 = 120
def full(m):
    out = np.zeros((H, W), np.uint8); out[Y0:Y0 + m.shape[0], :] = m; return out
L = lambda f: np.load(f).astype(np.uint8)
title, knight, bear, flag = [full(L(f)) for f in ('mk_title.npy', 'mk_knight.npy', 'mk_bear.npy', 'mk_flag.npy')]
sword = full((np.array(Image.open('m2_sword.png').convert('L')) > 127).astype(np.uint8))
top = np.zeros((H, W), np.uint8); top[0:420, 560:941] = (np.array(Image.open('m_topflag.png').convert('L')) > 127)
top[220:] = 0                                                # only use it for the strip the old window missed
pole_top = top.copy(); pole_top[:, :615] = 0; pole_top[:, 656:] = 0
flag_top = top.copy(); flag_top[:, :656] = 0
knight = ((knight | sword | pole_top) & (1 - title)).astype(np.uint8)
flag = ((flag | flag_top) & (1 - title)).astype(np.uint8); knight = (knight & (1 - flag)).astype(np.uint8)
bear = (bear & (1 - knight) & (1 - flag)).astype(np.uint8)
K = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))
# ---- background plate
hole = cv2.dilate(knight | bear | title | flag, K(9))
small = cv2.resize(P, (W // 4, H // 4), interpolation=cv2.INTER_AREA); hs = cv2.resize(hole, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST)
fill = cv2.GaussianBlur(cv2.resize(cv2.inpaint(small, hs, 9, cv2.INPAINT_TELEA), (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
hb = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
bg = (P * (1 - hb) + fill * hb).astype(np.uint8)
# live-value patches (poster px): COUNTRIES value, CYCLE pill text, stats-bar text, flag grid, "63 / 64 ELIMINATED"
patches = { 'countries': (486, 48, 566, 94), 'cycle': (384, 111, 560, 133), 'stats': (112, 1220, 832, 1254), 'grid': (38, 1311, 904, 1456), 'elimtxt': (340, 1482, 600, 1510) }
for k, (x0, y0, x1, y1) in patches.items():
    m = np.zeros((H, W), np.uint8); m[y0:y1, x0:x1] = 1
    if k == 'grid':   # flat dark fill taken from the rows just above the grid (the bar below must not bleed in)
        base = bg[1300:1308, x0:x1].reshape(-1, 3).mean(0); rng = np.random.default_rng(3)
        f = np.clip(base[None, None, :] * 0.9 + rng.normal(0, 3, (H, W, 1)), 0, 255)
        mb = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 9) * 1.25, 0, 1)[..., None]; bg = (bg * (1 - mb) + f * mb).astype(np.uint8)
    else:
        bg = cv2.inpaint(bg, m, 6, cv2.INPAINT_TELEA)
bear_rgb = P.copy()
ext = (cv2.dilate(bear, K(41)) & knight).astype(np.uint8)
h2 = ((ext | (1 - bear)) & cv2.dilate(bear, K(61))).astype(np.uint8); h2[bear == 1] = 0
src = cv2.inpaint(P.copy(), h2, 7, cv2.INPAINT_TELEA); bear_rgb[ext == 1] = src[ext == 1]; bear_a = (bear | ext).astype(np.uint8)
def rgba(rgb, m, feather=1.2):
    a = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), feather) * 1.15, 0, 1); return np.dstack([rgb, (a * 255).astype(np.uint8)])
def ramp(img, y0, y1):
    out = img.copy(); k = np.clip((y1 - np.arange(H)) / (y1 - y0), 0, 1)[:, None]; out[..., 3] = (out[..., 3] * k).astype(np.uint8); return out
layers = { 'body': rgba(P, knight), 'flag': rgba(P, flag, 0.8), 'bear': rgba(bear_rgb, bear_a), 'title': rgba(P, title, 1.0) }
layers['bodyFade'] = ramp(layers['body'], 720, 832); layers['bearFade'] = ramp(layers['bear'], 590, 760)
def enc(img, fmt, q):
    b = io.BytesIO(); Image.fromarray(img).save(b, fmt, quality=q, **({'method': 6} if fmt == 'WEBP' else {})); return b.getvalue()
out = { 'w': W, 'h': H, 'layers': {}, 'anchors': { 'mouth': [150, 438], 'bearPivot': [190, 680], 'feet': [480, 840], 'pole': [642, 0] },
        'grid': { 'x0': 62, 'dx': 50.8, 'y0': 1332, 'dy': 34.4, 'r': 15.5, 'cols': 17, 'rows': 4 },
        'text': { 'countries': [526, 71], 'cycle': [471, 122], 'stats': [470, 1237], 'elimtxt': [470, 1496] } }
for k, img in layers.items():
    a = img[..., 3]; ys, xs = np.where(a > 4); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    d = enc(img[y0:y1, x0:x1], 'WEBP', 86); out['layers'][k] = { 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode() }
    print(k, x0, y0, x1 - x0, y1 - y0, len(d) // 1024, 'KB')
d = enc(bg, 'JPEG', 88); out['layers']['bg'] = { 'x': 0, 'y': 0, 'w': W, 'h': H, 'src': 'data:image/jpeg;base64,' + base64.b64encode(d).decode() }
Image.fromarray(bg).save('V_bg.png'); print('bg', len(d) // 1024, 'KB')
json.dump(out, open('winart_ru_vertical.json', 'w')); print('total KB', len(json.dumps(out)) // 1024)
