# Build animation layers from the user's poster (no redrawing): masks from SAM, cleaned; hidden areas filled by inpainting.
import numpy as np, cv2, json, base64, io
from PIL import Image
Y0 = 120
win = np.array(Image.open('win.png').convert('RGB'))          # poster y 120..1215
H, W = win.shape[:2]
M = lambda f: (np.array(Image.open(f).convert('L')) > 127).astype(np.uint8)
def clean(m, min_area=900, close=5, keep=None):
    if close: m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= min_area and (keep is None or keep(st[i])): out[lab == i] = 1
    # fill holes
    inv = (1 - out).astype(np.uint8); n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n2):
        x, y, w, h, a = st2[i]
        if a < 2500 and x > 0 and y > 0 and x + w < W and y + h < H: out[lab2 == i] = 1
    return out
title = clean(M('m_title.png'), 2000)
title[:640 - 0] = 0 if False else title[:640]  # title lives low in the window
title[:560] = 0
flag = clean(M('m2_flag.png'), 1500)
knight = M('m2_knight.png') | M('m_warrior.png') | flag
knight[:, :300] = 0                                             # nothing of the warrior is left of x=300
knight = clean(knight, 1500, 3)
knight = knight & (1 - title)
bear = M('m_bear.png') | M('m2_bear.png')
bear[:170] = 0; bear[:, 430:] = 0                               # drop the castle spire picked up above the head
bear = clean(bear, 1500, 5) & (1 - knight) & (1 - title)
flag = flag & knight
print('areas', {k: int(v.sum()) for k, v in dict(title=title, knight=knight, bear=bear, flag=flag).items()})
np.save('mk_title.npy', title); np.save('mk_knight.npy', knight); np.save('mk_bear.npy', bear); np.save('mk_flag.npy', flag)
