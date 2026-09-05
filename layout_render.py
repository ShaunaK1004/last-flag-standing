#!/usr/bin/env python3
"""Replay layout_trace.json over bg.jpg so the new layout can be LOOKED at.

Scope, stated plainly so this picture is not mistaken for more than it is:
  * exact, from the recording - every position, radius, rect, baseline, font px
    size, fill colour, stroke width, alpha and gradient colour stop. Nothing here
    decides where anything goes.
  * approximate - the text FACE (DejaVu Sans Bold, because Chrome's system-ui is
    not installed here; DejaVu is markedly wider than Segoe UI, so this is the
    pessimistic case for collisions), shadows (dropped), and ball sprites, which
    are drawn as placeholder discs since the flag canvases cannot cross the vm
    boundary. flag_check.png already verifies the flags themselves.
  * missing - there is no colour emoji font in this sandbox, so U+1F44D is drawn
    as a placeholder ring and reported below.
"""
import json, math, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, 'layout_trace.json')))
W, H = 1080, 1920
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

canvas = np.zeros((H, W, 3), dtype=np.float64)
notes = []


def col(s):
    """CSS colour -> (r,g,b,a). Gradients handled separately."""
    s = (s or '#000').strip()
    m = re.match(r'rgba?\(([^)]*)\)', s)
    if m:
        p = [float(x) for x in m.group(1).split(',')]
        return (p[0], p[1], p[2], p[3] if len(p) > 3 else 1.0)
    if s.startswith('#'):
        c = s[1:]
        if len(c) == 3:
            c = ''.join(ch * 2 for ch in c)
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (1.0,)
    return (255, 255, 255, 1.0)


def grad_field(tag):
    """'<grad|kind|args|p@colour;...>' -> (HxWx3 colour field, HxW alpha field)."""
    _, kind, args, stops = tag[1:-1].split('|')
    a = [float(x) for x in args.split(',')]
    st = []
    for s in stops.split(';'):
        p, c = s.split('@', 1)
        st.append((float(p), col(c)))
    st.sort()
    ys, xs = np.mgrid[0:H, 0:W]
    if kind == 'linear':
        x0, y0, x1, y1 = a
        dx, dy = x1 - x0, y1 - y0
        L = dx * dx + dy * dy
        t = ((xs - x0) * dx + (ys - y0) * dy) / L if L else np.zeros_like(xs, float)
    else:
        x0, y0, r0, x1, y1, r1 = a
        d = np.hypot(xs - x1, ys - y1)
        t = (d - r0) / (r1 - r0) if r1 != r0 else np.zeros_like(d)
    t = np.clip(t, 0, 1)
    cf = np.zeros((H, W, 3))
    af = np.zeros((H, W))
    for i in range(len(st) - 1):
        p0, c0 = st[i]
        p1, c1 = st[i + 1]
        seg = (t >= p0) & (t <= p1) if i == 0 else (t > p0) & (t <= p1)
        u = np.zeros_like(t)
        if p1 > p0:
            u[seg] = (t[seg] - p0) / (p1 - p0)
        for ch in range(3):
            cf[..., ch][seg] = c0[ch] + (c1[ch] - c0[ch]) * u[seg]
        af[seg] = c0[3] + (c1[3] - c0[3]) * u[seg]
    lo, hi = t <= st[0][0], t >= st[-1][0]
    for ch in range(3):
        cf[..., ch][lo] = st[0][1][ch]
        cf[..., ch][hi] = st[-1][1][ch]
    af[lo] = st[0][1][3]
    af[hi] = st[-1][1][3]
    return cf, af


def paint(mask, style, ga=1.0):
    """Composite a style over the canvas through an L-mode coverage mask."""
    global canvas
    m = np.asarray(mask, dtype=np.float64) / 255.0
    if m.max() == 0:
        return
    if str(style).startswith('<grad'):
        cf, af = grad_field(style)
        a = (m * af * ga)[..., None]
        canvas = canvas * (1 - a) + cf * a
    else:
        r, g, b, sa = col(style)
        a = (m * sa * ga)[..., None]
        canvas = canvas * (1 - a) + np.array([r, g, b]) * a


def arc_pts(cx, cy, r, a0, a1, ccw):
    if not ccw:
        while a1 < a0:
            a1 += 2 * math.pi
        a1 = min(a1, a0 + 2 * math.pi)
    else:
        while a1 > a0:
            a1 -= 2 * math.pi
        a1 = max(a1, a0 - 2 * math.pi)
    n = max(12, int(abs(a1 - a0) / (2 * math.pi) * 240))
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * r,
             cy + math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + 1)]


fonts = {}
def font_for(px):
    px = max(6, int(round(px)))
    if px not in fonts:
        fonts[px] = ImageFont.truetype(FONT, px)
    return fonts[px]


bg = Image.open(os.path.join(HERE, 'bg.jpg')).convert('RGB')
path, arcto_r, tx, ty = [], 0, 0.0, 0.0
tstack = []
prev_text = None       # (recorded_x, drawn_x, y, string, anchor, font) for chaining
emoji_boxes = []

for op, args, st in T['calls']:
    ga = float(st.get('globalAlpha', 1) or 1)
    if op == 'drawImage':
        if isinstance(args[0], str) and args[0].startswith('<'):
            if len(args) >= 5 and args[3] == W and args[4] == H:
                canvas[:] = np.asarray(bg, dtype=np.float64)      # the backdrop photo
            elif len(args) >= 5:
                x, y, w, h = args[1:5]                            # a ball / dead flag
                m = Image.new('L', (W, H), 0)
                ImageDraw.Draw(m).ellipse([x + tx, y + ty, x + tx + w, y + ty + h], fill=255)
                paint(m, 'rgba(178,186,205,1)', ga)
                m2 = Image.new('L', (W, H), 0)
                ImageDraw.Draw(m2).ellipse([x + tx, y + ty, x + tx + w, y + ty + h],
                                           outline=255, width=3)
                paint(m2, 'rgba(255,255,255,0.9)', ga)
        continue
    if op == 'translate':
        tx += args[0]; ty += args[1]; continue
    # a real transform STACK. The first version reset tx,ty to 0 on any restore, and
    # drawHub() nests save/translate/save/rotate/../restore/../restore - so the hub
    # ring got drawn at the origin and appeared as a stray magenta arc in the top-left
    # corner of the preview. That was the picture lying about the build, which is the
    # one thing a verification picture must never do.
    if op == 'save':
        tstack.append((tx, ty)); continue
    if op == 'restore':
        if tstack:
            tx, ty = tstack.pop()
        continue
    if op in ('rotate', 'setTransform', 'clip', 'closePath', 'beginPath') \
            or op.startswith('#set'):
        if op == 'beginPath':
            path, arcto_r = [], 0
        continue
    if op == 'moveTo':
        path.append((args[0] + tx, args[1] + ty)); continue
    if op == 'lineTo':
        path.append((args[0] + tx, args[1] + ty)); continue
    if op == 'arc':
        ccw = bool(args[5]) if len(args) > 5 else False
        path += [(x + tx, y + ty) for x, y in
                 arc_pts(args[0], args[1], args[2], args[3], args[4], ccw)]
        continue
    if op == 'arcTo':
        path += [(args[0] + tx, args[1] + ty), (args[2] + tx, args[3] + ty)]
        arcto_r = args[4]; continue
    if op in ('fill', 'stroke'):
        if len(path) >= 2:
            m = Image.new('L', (W, H), 0)
            d = ImageDraw.Draw(m)
            if arcto_r:                                   # roundRect(): bbox + radius
                xs = [p[0] for p in path]; ys = [p[1] for p in path]
                box = [min(xs), min(ys), max(xs), max(ys)]
                if op == 'fill':
                    d.rounded_rectangle(box, radius=arcto_r, fill=255)
                else:
                    d.rounded_rectangle(box, radius=arcto_r, outline=255,
                                        width=max(1, int(st.get('lineWidth', 1))))
            elif op == 'fill':
                d.polygon(path, fill=255)
            else:
                d.line(path, fill=255, width=max(1, int(st.get('lineWidth', 1))),
                       joint='curve')
            paint(m, st['strokeStyle'] if op == 'stroke' else st['fillStyle'], ga)
        path, arcto_r = [], 0
        continue
    if op == 'fillRect':
        x, y, w, h = args[:4]
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).rectangle([x + tx, y + ty, x + tx + w, y + ty + h], fill=255)
        paint(m, st['fillStyle'], ga)
        continue
    if op == 'fillText':
        s, x, y = str(args[0]), args[1] + tx, args[2] + ty
        size = float((re.search(r'(\d+(?:\.\d+)?)px', st['font']) or [0, 10])[1])
        f = font_for(size)
        anchor = {'center': 'ms', 'right': 'rs', 'end': 'rs'}.get(st.get('textAlign'), 'ls')
        # Multi-segment runs on one baseline (the two-colour brand) are positioned by
        # the BUILD as "segment 2 starts where measureText says segment 1 ended". The
        # recorded x for segment 2 therefore encodes the harness's estimated Chrome
        # metrics, not DejaVu's - replaying it literally drew "FLAGS WAR" and "ARENA"
        # on top of each other. So re-apply the rule with this font's own metrics:
        # that renders what the build DOES, rather than a coordinate meant for a
        # different typeface. Chrome needs no such correction; measureText is exact.
        if prev_text and anchor == 'ls' and prev_text[4] == 'ls' \
                and abs(prev_text[2] - y) < 0.01 and args[1] + tx > prev_text[0]:
            x = prev_text[1] + ImageDraw.Draw(Image.new('L', (1, 1))).textlength(
                prev_text[3], font=prev_text[5])
            notes.append('brand segment 2 re-flowed to DejaVu metrics (see comment)')
        if '\U0001F44D' in s:
            s = s.replace('\U0001F44D', ' ')
            emoji_boxes.append((x, y, size, anchor, s))
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).text((x, y), s, font=f, fill=255, anchor=anchor)
        paint(m, st['fillStyle'], ga)
        prev_text = (args[1] + tx, x, y, s, anchor, f)
        continue

# placeholder for the emoji PIL cannot draw
for x, y, size, anchor, s in emoji_boxes:
    f = font_for(size)
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    wtxt = d.textlength(s, font=f)
    left = x - wtxt / 2 if anchor == 'ms' else x
    d.ellipse([left - size * 0.1, y - size * 0.85, left + size * 0.75, y + size * 0.02],
              outline=255, width=3)
    paint(m, 'rgba(255,211,77,0.95)', 1.0)
    notes.append('U+1F44D drawn as a placeholder ring: no colour emoji font here')

img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))

# ---- overlay the one assertion this picture exists to show -------------------
ov = img.copy()
d = ImageDraw.Draw(ov)
top, bot = T['arenaTop'], T['arenaBot']
d.line([0, top, W, top], fill=(255, 60, 120), width=3)
d.text((14, top - 34), f'arena top  y={top}', font=font_for(26), fill=(255, 60, 120))
d.line([0, bot, W, bot], fill=(255, 60, 120), width=3)
for y, lbl in ((412, 'OLD "WHERE ARE"  y=412'), (466, 'OLD "YOU FROM?"  y=466'),
               (508, 'OLD rapid-fire badge  y=508')):
    d.line([0, y, W, y], fill=(255, 200, 60), width=2)
    d.text((14, y + 4), lbl, font=font_for(24), fill=(255, 200, 60))

img.save(os.path.join(HERE, 'layout_preview.png'))
ov.save(os.path.join(HERE, 'layout_preview_annotated.png'))
side = Image.new('RGB', (W * 2 + 24, H), (20, 20, 24))
side.paste(img, (0, 0)); side.paste(ov, (W + 24, 0))
side.resize((side.width // 2, side.height // 2), Image.LANCZOS).save(
    os.path.join(HERE, 'layout_preview_pair.png'))
print('wrote layout_preview.png, layout_preview_annotated.png, layout_preview_pair.png')
for nt in sorted(set(notes)):
    print('  note:', nt)
print('  note: text face is DejaVu Sans Bold (wider than Chrome\'s Segoe UI), '
      'shadows dropped, balls are placeholder discs')
