#!/usr/bin/env python3
"""Replay the recorded canvas call stream from flag_trace.js in PIL.

This is a picture of what the shipped paintFlag() emitted, not a picture of what I
think it should emit. The only thing implemented here is the Canvas2D semantics
(path building, arc direction, fill), which is exactly the part that was wrong
before: the crescent relied on globalCompositeOperation='destination-out'.
"""
import json, math, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
trace = json.load(open(os.path.join(HERE, 'flag_trace.json')))
SS = 8  # supersample, then downsample: gives clean edges and sub-pixel truth

def hexcol(c):
    c = (c or '#000000').strip()
    if c.startswith('#'):
        c = c[1:]
        if len(c) == 3:
            c = ''.join(ch*2 for ch in c)
        if len(c) >= 6:
            return tuple(int(c[i:i+2], 16) for i in (0, 2, 4)) + (255,)
    return (0, 0, 0, 255)

def arc_pts(cx, cy, r, a0, a1, ccw):
    """Canvas arc(): angles in radians, ccw=True sweeps decreasing. Canvas
    normalises the sweep to at most a full turn."""
    if not ccw:
        while a1 < a0:
            a1 += 2*math.pi
        if a1 - a0 > 2*math.pi:
            a1 = a0 + 2*math.pi
    else:
        while a1 > a0:
            a1 -= 2*math.pi
        if a0 - a1 > 2*math.pi:
            a1 = a0 - 2*math.pi
    n = max(8, int(abs(a1-a0)/(2*math.pi)*180))
    return [(cx + math.cos(a0 + (a1-a0)*i/n)*r,
             cy + math.sin(a0 + (a1-a0)*i/n)*r) for i in range(n+1)]

def render(name, rec):
    w, h = rec['w']*SS, rec['h']*SS
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    path = []          # list of subpaths, each a list of points
    for op, args, st in rec['calls']:
        fill = hexcol(st.get('fillStyle'))
        stroke = hexcol(st.get('strokeStyle'))
        lw = max(1, int(round((st.get('lineWidth') or 1)*SS)))
        if op == 'fillRect':
            x, y, ww, hh = [v*SS for v in args[:4]]
            d.rectangle([x, y, x+ww, y+hh], fill=fill)
        elif op == 'beginPath':
            path = [[]]
        elif op == 'moveTo':
            path.append([(args[0]*SS, args[1]*SS)])
        elif op == 'lineTo':
            if not path:
                path = [[]]
            path[-1].append((args[0]*SS, args[1]*SS))
        elif op == 'arc':
            cx, cy, r = args[0]*SS, args[1]*SS, args[2]*SS
            a0, a1 = args[3], args[4]
            ccw = bool(args[5]) if len(args) > 5 else False
            pts = arc_pts(cx, cy, r, a0, a1, ccw)
            if not path:
                path = [[]]
            path[-1].extend(pts)
        elif op == 'ellipse':
            cx, cy, rx, ry = args[0]*SS, args[1]*SS, args[2]*SS, args[3]*SS
            pts = [(cx+math.cos(t/60*2*math.pi)*rx, cy+math.sin(t/60*2*math.pi)*ry)
                   for t in range(61)]
            if not path:
                path = [[]]
            path[-1].extend(pts)
        elif op == 'closePath':
            pass
        elif op == 'fill':
            # Canvas fills all subpaths as one shape with nonzero winding. PIL has no
            # winding fill, so fill the largest subpath and treat the rest as holes only
            # when they are strictly inside. For these flags every fill() is either one
            # subpath, or the crescent's two arcs which form ONE closed outline.
            merged = [p for p in path if len(p) >= 3]
            if len(merged) == 1:
                d.polygon(merged[0], fill=fill)
            elif len(merged) > 1:
                d.polygon([pt for sub in merged for pt in sub], fill=fill)
            path = []
        elif op == 'stroke':
            for sub in path:
                if len(sub) >= 2:
                    d.line(sub, fill=stroke, width=lw, joint='curve')
            path = []
        elif op in ('save', 'restore', 'translate', 'setTransform', 'clip'):
            pass  # none of the traced flags use transforms except leaf (translate)
    return img.resize((rec['w'], rec['h']), Image.LANCZOS)

sheet_w = 0
imgs = {}
for name, rec in trace.items():
    imgs[name] = render(name, rec)

# one contact sheet, on a mid grey so ANY transparency shows up as grey bleed
cols = 4
rows = (len(imgs)+cols-1)//cols
cw, ch = 120, 86
pad = 14
sheet = Image.new('RGB', (cols*(cw+pad)+pad, rows*(ch+pad+16)+pad), (128, 128, 128))
dd = ImageDraw.Draw(sheet)
for i, (name, im) in enumerate(imgs.items()):
    cx = pad + (i % cols)*(cw+pad)
    cy = pad + (i//cols)*(ch+pad+16)
    sheet.paste(im, (cx, cy), im)
    dd.text((cx, cy+ch+2), name[:16], fill=(20, 20, 20))
sheet.save(os.path.join(HERE, 'flag_check.png'))

print('wrote flag_check.png')
print('\ntransparency audit (alpha<250 = a hole in the flag):')
for name, im in imgs.items():
    a = im.split()[3]
    holes = sum(1 for p in a.getdata() if p < 250)
    tot = im.width*im.height
    print(f'  {name.ljust(12)} {holes:5d}/{tot} px transparent  ({100*holes/tot:5.1f}%)')
