import sys
from PIL import Image, ImageDraw
code=sys.argv[1]; y0=int(sys.argv[2]) if len(sys.argv)>2 else 0; y1=int(sys.argv[3]) if len(sys.argv)>3 else 1672; sc=float(sys.argv[4]) if len(sys.argv)>4 else 0.62
im=Image.open(f'{code}/poster.png').convert('RGB').crop((0,y0,941,y1)); d=ImageDraw.Draw(im,'RGBA')
for x in range(0,941,50): d.line([(x,0),(x,im.height)],fill=(0,255,255,70 if x%100 else 140),width=1); 
for y in range((y0//50)*50,y1,50):
    if y<y0: continue
    d.line([(0,y-y0),(941,y-y0)],fill=(255,0,255,70 if y%100 else 140),width=1)
for x in range(0,941,100):
    for y in range(((y0+99)//100)*100,y1,100): d.text((x+2,y-y0+2),f'{x},{y}',fill=(255,255,0,255))
im=im.resize((int(im.width*sc),int(im.height*sc)),Image.LANCZOS); im.save(f'/tmp/claude-0/-home-claude/01da59ac-3903-517e-934e-a8630e314317/scratchpad/g_{code}.png')
