import numpy as np, cv2, json, base64, io
from PIL import Image
win = np.array(Image.open('win.png').convert('RGB')); H, W = win.shape[:2]
L = lambda f: np.load(f).astype(np.uint8)
title, knight, bear, flag = L('mk_title.npy'), L('mk_knight.npy'), L('mk_bear.npy'), L('mk_flag.npy')
sword = (np.array(Image.open('m2_sword.png').convert('L')) > 127).astype(np.uint8)
knight = ((knight | sword) & (1 - title)).astype(np.uint8)
bear = (bear & (1 - knight)).astype(np.uint8)
flag = (flag & knight).astype(np.uint8)
body = (knight & (1 - flag)).astype(np.uint8)
K = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))
# ---- background plate: fill everything the layers cover (+ the baked "WHERE ARE YOU FROM?" text)
hole = cv2.dilate(knight | bear | title, K(9))
hole[0:108, 330:610] = 1
small = cv2.resize(win, (W // 4, H // 4), interpolation=cv2.INTER_AREA); hs = cv2.resize(hole, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST)
fill_s = cv2.inpaint(small, hs, 9, cv2.INPAINT_TELEA)
fill = cv2.GaussianBlur(cv2.resize(fill_s, (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
bg = win.copy(); hb = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
bg = (bg * (1 - hb) + fill * hb).astype(np.uint8)
# ---- bear: extend its fur a little under the warrior so a moving bear never shows a hole
ext = (cv2.dilate(bear, K(41)) & knight).astype(np.uint8)
src = win.copy(); h2 = ((ext | (1 - bear)) & cv2.dilate(bear, K(61))).astype(np.uint8); h2[bear == 1] = 0
src = cv2.inpaint(src, h2, 7, cv2.INPAINT_TELEA)
bear_rgb = win.copy(); bear_rgb[ext == 1] = src[ext == 1]; bear_a = (bear | ext).astype(np.uint8)
def rgba(rgb, m, feather=1.2):
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), feather) if feather else m.astype(np.float32)
    a = np.clip(a * 1.15, 0, 1); return np.dstack([rgb, (a * 255).astype(np.uint8)])
def ramp(img, y0, y1):   # alpha fades out between window rows y0..y1
    out = img.copy(); k = np.clip((y1 - np.arange(H)) / (y1 - y0), 0, 1)[:, None]; out[..., 3] = (out[..., 3] * k).astype(np.uint8); return out
layers = { 'body': rgba(win, body), 'flag': rgba(win, flag, 0.8), 'bear': rgba(bear_rgb, bear_a), 'title': rgba(win, title, 1.0) }
layers['bodyFade'] = ramp(layers['body'], 600, 712); layers['bearFade'] = ramp(layers['bear'], 470, 640)
out = { 'w': W, 'h': H, 'srcY': 120, 'layers': {} }
def enc(img, fmt, q):
    b = io.BytesIO(); Image.fromarray(img).save(b, fmt, quality=q, method=6) if fmt == 'WEBP' else Image.fromarray(img).save(b, fmt, quality=q); return b.getvalue()
for k, img in layers.items():
    a = img[..., 3]; ys, xs = np.where(a > 4); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    data = enc(img[y0:y1, x0:x1], 'WEBP', 86)
    out['layers'][k] = { 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'src': 'data:image/webp;base64,' + base64.b64encode(data).decode() }
    Image.fromarray(img[y0:y1, x0:x1]).save(f'L_{k}.png'); print(k, x0, y0, x1 - x0, y1 - y0, len(data) // 1024, 'KB')
data = enc(bg, 'JPEG', 88); out['layers']['bg'] = { 'x': 0, 'y': 0, 'w': W, 'h': H, 'src': 'data:image/jpeg;base64,' + base64.b64encode(data).decode() }
Image.fromarray(bg).save('L_bg.png'); print('bg', len(data) // 1024, 'KB')
# anchors (window coords): mouth of the bear, bear chest pivot, warrior feet, flag pole x
out['anchors'] = { 'mouth': [150, 318], 'bearPivot': [190, 560], 'feet': [480, 720], 'pole': [642, 0] }
open('/home/claude/src5/work/epic_art_ru.js', 'w').write('/* Russia winner art: layers cut from the reference poster (Shaunak\'s image) — not redrawn */\nEPIC_ART.ru = ' + json.dumps(out) + ';\n')
print('total js KB', len(json.dumps(out)) // 1024)
