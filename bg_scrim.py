#!/usr/bin/env python3
"""Build bg.jpg at design size and DERIVE the scrim alpha from a contrast target.

The scrim is the dark wash between the photo and the HUD. Its alpha is not a taste
call: white HUD text has to stay readable over Messi's white shirt and over the
bright blue nebula, both of which sit exactly under the header. So measure the
background luminance inside every band where white text is drawn WITHOUT a panel
behind it, and solve for the smallest alpha that meets a stated contrast ratio.

WCAG 2.1 contrast ratio = (L1+0.05)/(L2+0.05) on relative luminance.
White text L1 = 1.0, so a ratio R needs the backdrop at L2 <= 1.05/R - 0.05.
All of this text is >=30px at weight 600-900, far past the 18.7px-bold threshold
for "large scale", whose AA requirement is 3:1 and AAA is 4.5:1.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '/sessions/nifty-wonderful-euler/mnt/uploads/WhatsApp Image 2026-08-25 at 8.04.27 PM.jpeg'
W, H = 1080, 1920

src = Image.open(SRC).convert('RGB')
print(f'source {src.size}  aspect {src.width/src.height:.6f}')
print(f'canvas {W}x{H}    aspect {W/H:.6f}')
assert abs(src.width/src.height - W/H) < 1e-6, 'aspect differs: a crop decision would be needed'
print('-> identical 9:16 aspect, so a straight scale covers with zero crop and zero letterbox')

bg = src.resize((W, H), Image.LANCZOS)
out = os.path.join(HERE, 'bg.jpg')
bg.save(out, 'JPEG', quality=86, optimize=True, progressive=True)
print(f'wrote bg.jpg  {W}x{H}  {os.path.getsize(out)} bytes')

# ---------------------------------------------------------------------------
# bands where white text is drawn with NOTHING but the backdrop behind it.
# (panel text is excluded: PAL.panel is rgba(10,14,34,0.72) which is its own scrim)
# boxes are the NEW layout, cap-height bands, x padded to the widest plausible string
BANDS = {
    'brand            ': (28, 70, 470, 115),
    'status line      ': (330, 176, 750, 210),
    'prompt WHERE ARE ': (230, 222, 850, 262),
    'prompt YOU FROM? ': (230, 280, 850, 332),
    'ALL ELIMINATED   ': (300, 1376, 780, 1414),
    'progress label   ': (360, 1708, 720, 1738),
}
SCRIM = (4, 7, 20)


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


LUT = [lin(i) for i in range(256)]


def lum(px):
    r, g, b = px
    return 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b]


def pct(vals, p):
    v = sorted(vals)
    return v[min(len(v) - 1, int(p / 100 * len(v)))]


def blend(px, a):
    return tuple(int(round((1 - a) * px[i] + a * SCRIM[i])) for i in range(3))


print('\nbackground luminance under each unprotected white-text band (bare photo):')
allpx = []
for name, box in BANDS.items():
    px = list(bg.crop(box).getdata())
    allpx += px
    ls = [lum(p) for p in px]
    p95 = pct(ls, 95)
    ratio = 1.05 / (p95 + 0.05)
    print(f'  {name} n={len(px):6d}  median L={pct(ls,50):.3f}  p95 L={p95:.3f}'
          f'  -> white text contrast {ratio:.2f}:1')

print('\nalpha sweep: p95 luminance across ALL bands, and the worst-case contrast')
print('  alpha   p95 L   contrast   verdict')
chosen = {}
for i in range(0, 91, 2):
    a = i / 100
    ls = [lum(blend(p, a)) for p in allpx[::7]]      # every 7th px: 1/7 of 190k, plenty
    p95 = pct(ls, 95)
    R = 1.05 / (p95 + 0.05)
    for tgt in (3.0, 4.5):
        if tgt not in chosen and R >= tgt:
            chosen[tgt] = (a, p95, R)
    mark = ''
    if chosen.get(3.0, (None,))[0] == a:
        mark = '<- AA large (3:1) reached here'
    if chosen.get(4.5, (None,))[0] == a:
        mark = '<- AAA large (4.5:1) reached here'
    print(f'   {a:.2f}   {p95:.3f}   {R:5.2f}:1   {mark}')

print()
for tgt, (a, p95, R) in sorted(chosen.items()):
    print(f'target {tgt}:1  -> alpha {a:.2f}  (p95 L {p95:.3f}, actual {R:.2f}:1)')
