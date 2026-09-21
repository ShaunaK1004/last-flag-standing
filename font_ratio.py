#!/usr/bin/env python3
"""Measure the REAL advance-width ratio of the face Dell's browser resolves for
`system-ui`, from his own browser screenshot.

Why this exists. layout_check.js cannot call measureText, so it estimates text
width as len*px*RATIO and reports every horizontal result as an estimate at
RATIO 0.60 and 0.70. The PIL preview then draws with DejaVu Sans Bold, which is
wider still, and in that preview "ARENA" comes within a few pixels of the
COUNTRIES panel. Two possibilities: either the real face is narrow and there is
plenty of room, or the 0.70 worst case is optimistic and the brand really can
collide on his machine. Guessing is not allowed, so measure.

Method. The screenshot Dell attached is the OLD build rendered by the ACTUAL
browser, so it contains that face's real metrics. Four strings in it are drawn at
font sizes still literally present in index.html and unchanged by this edit:

    ALL ELIMINATED       800 40px   centred on W/2
    n / 64 ELIMINATED    600 26px   centred on W/2
    COUNTRIES/REMAINING  600 24px   centred in their panels
    ELIMINATED           800 24px   left aligned in the kill card

Scale the screenshot back to design pixels using a feature whose design width is
exact (the progress bar / CTA button, both x = 40..1040, i.e. 1000 px), then
measure each string's ink width and divide by len*px. That yields the face's real
mean advance ratio, which is what the brand budget has to survive.

Ink width is the union of glyph bounding boxes, which is slightly NARROWER than
the advance sum (it drops the right side bearing of the last glyph and any
leading bearing of the first). So the ratio printed here is a lower bound on the
advance ratio, and the correction is well under one glyph's worth on a 14-glyph
string. Reported as such below.
"""
import os
import numpy as np
from PIL import Image

UP = '/sessions/nifty-wonderful-euler/mnt/uploads'
SHOT = f'{UP}/Screenshot 2026-08-25 225628.png'
im = Image.open(SHOT).convert('RGB')
A = np.asarray(im, dtype=np.int16)
SH, SW = A.shape[:2]
print(f'screenshot {SW}x{SH}   design canvas 1080x1920')

# ---- 1. calibrate scale + offset ----------------------------------------------
# The canvas is styled to fill the viewport width, so scale = SW/1080. The height
# that implies (1920*scale) is checked against SH below, and the whole calibration
# is then verified against a feature whose design geometry is exact and which was
# NOT used to derive it: the arena ring at centre (540,860) radius 483.
scale = SW / 1080.0
ox = 0.0
oy_guess = 0.0
print(f'-> scale {scale:.5f} px per design px from the width')
print(f'   that implies a {1920*scale:.0f} px tall canvas; the shot is {SH} px '
      f'({SH-1920*scale:+.0f} px, i.e. the bottom edge is cropped by that much)')


def d2s(x, y):
    return ox + x * scale, oy_guess + y * scale


# ---- verify the calibration on the arena ring, whose design geometry is fixed ----
CX, CY, R = 540, 860, 483
sx, sy = d2s(CX, CY)
# the ring stroke is bright cyan; walk up the centre column and find the top edge
col = A[:, int(round(sx))]
cyan = (col[:, 2] > 120) & (col[:, 0] < 140) & (col[:, 1] > 120)
idx = np.where(cyan[:int(sy)])[0]
if len(idx):
    top_measured = (idx[0] - oy_guess) / scale
    print(f'   check: arena ring top found at design y={top_measured:.1f}, '
          f'expected {CY-R} -> off by {top_measured-(CY-R):+.1f} px')

# ---- 2. measure ink width of strings whose font px is known --------------------
# Only strings that are centred on W/2 and sit alone on their line are used, so the
# horizontal window cannot accidentally include a neighbour's glyphs.
KNOWN = [
    # label,                  string,               font px, design y band
    ('ALL ELIMINATED  w800',  'ALL ELIMINATED',      40, (1360, 1414)),
    ('progress label  w600',  '5 / 64 ELIMINATED',   26, (1700, 1740)),
]


def ink_box(x0, x1, y0, y1, thr=150):
    """Bright-pixel bounding box inside a design-space window, in design px."""
    sx0, sy0 = d2s(x0, y0)
    sx1, sy1 = d2s(x1, y1)
    box = A[int(sy0):int(sy1), int(sx0):int(sx1)]
    if box.size == 0:
        return None
    lum = box.mean(2)
    on = lum > thr
    cols = np.where(on.any(0))[0]
    rows = np.where(on.any(1))[0]
    if len(cols) < 4 or len(rows) < 3:
        return None
    return dict(w=(cols[-1] - cols[0] + 1) / scale,
                h=(rows[-1] - rows[0] + 1) / scale,
                x0=(int(sx0) + cols[0]) / scale, x1=(int(sx0) + cols[-1]) / scale,
                y0=(int(sy0) + rows[0]) / scale, y1=(int(sy0) + rows[-1]) / scale)


print('\nmeasured in the real browser render (design px):')
print('  strings whose font size is still literally in index.html:')
ratios, capfracs = [], []
for label, s, px, (y0, y1) in KNOWN:
    r = ink_box(60, 1020, y0, y1)
    if not r:
        print(f'    {label:22s} NOT FOUND in band y {y0}..{y1}')
        continue
    n = len(s)
    ratio = r['w'] / (n * px)
    capf = r['h'] / px
    ratios.append(ratio)
    capfracs.append(capf)
    print(f'    {label:22s} "{s}"')
    print(f'      n={n:2d} px={px}  ink {r["w"]:6.1f} x {r["h"]:5.1f}  '
          f'x {r["x0"]:.0f}..{r["x1"]:.0f}  centre {(r["x0"]+r["x1"])/2:.0f} (expect 540)'
          f'  baseline~{r["y1"]:.0f}')
    print(f'      -> advance ratio {ratio:.4f} per char per em,  '
          f'cap height {capf:.4f} em')

if not ratios:
    raise SystemExit('nothing measured; the bands need adjusting')

capf = float(np.mean(capfracs))
print(f'\n  mean cap height {capf:.4f} em.  Reference cap heights: Segoe UI 0.700, '
      f'Roboto 0.711, Helvetica/Arial 0.716, DejaVu Sans 0.729.')

# ---- 3. the weight-900 brand string, measured the same way ---------------------
# The old build drew "COUNTRYBALL" at weight 900 on its own line. Its font size is
# not recoverable from the current source, so recover it from the measured cap
# height instead: px = ink height / cap fraction, using the fraction just measured
# on strings whose px IS known. That keeps this a measurement with one documented
# font metric in it, rather than an assumption.
b = ink_box(60, 1020, 60, 130)
brand_ratio = None
if b:
    px_est = b['h'] / capf
    brand_ratio = b['w'] / (len('COUNTRYBALL') * px_est)
    print(f'\n  old brand "COUNTRYBALL" (weight 900): ink {b["w"]:.1f} x {b["h"]:.1f}, '
          f'x {b["x0"]:.0f}..{b["x1"]:.0f}')
    print(f'      implied font size {px_est:.1f} px  ->  weight-900 advance ratio '
          f'{brand_ratio:.4f}')
else:
    print('\n  old brand not found in y 60..130')

mean_ratio = float(np.mean(ratios))
worst_ratio = max(ratios + ([brand_ratio] if brand_ratio else []))
print(f'\nadvance ratio: mean {mean_ratio:.4f}, worst {worst_ratio:.4f} '
      f'(all are LOWER bounds - an ink box omits the side bearings of the first and '
      f'last glyph, worth well under one glyph on a 14-glyph string)')

# ---- 3. does FLAGS WAR ARENA fit its budget at that measured ratio? ------------
BRAND = 'FLAGS WAR ARENA'
BRAND_X, BRAND_W, P1X = 28, 416, 468
print(f'\nbrand budget: x {BRAND_X}, width {BRAND_W}, COUNTRIES panel starts {P1X}')
print('fitFont walks down from 52 px until measureText fits, so the size it picks '
      'depends on the ratio:')
for name, ratio in (('measured mean', mean_ratio),
                    ('measured worst', worst_ratio),
                    ('+8% safety on worst', worst_ratio * 1.08),
                    ('layout_check wide case', 0.70),
                    ('DejaVu Sans Bold (preview)', None)):
    if ratio is None:
        from PIL import ImageFont, ImageDraw
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 100)
        ratio = ImageDraw.Draw(Image.new('L', (1, 1))).textlength(BRAND, font=f) \
            / (len(BRAND) * 100)
    size = 52
    while size > 12 and len(BRAND) * size * ratio > BRAND_W:
        size -= 1
    w = len(BRAND) * size * ratio
    right = BRAND_X + w
    print(f'  ratio {ratio:.4f}  {name:26s} -> fitFont picks {size} px, '
          f'width {w:5.0f}, right edge {right:5.0f}, '
          f'{"CLEARS" if right < P1X else "COLLIDES WITH"} the panel '
          f'by {abs(P1X-right):.0f} px')

print('\nnote: fitFont is a real measureText loop in the browser, so the brand can '
      'never overflow BRAND_W there; the only question these rows answer is how '
      'small the caps get, and whether 416 px is a sane budget for the face in use.')
