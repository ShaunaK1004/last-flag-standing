import sys, numpy as np
from PIL import Image
code=sys.argv[1]; names=sys.argv[2].split(','); sc=float(sys.argv[3]) if len(sys.argv)>3 else 0.5
P=np.array(Image.open(f'{code}/poster.png').convert('RGB')).astype(np.float32)
cols=[(0,255,0),(0,120,255),(255,255,0),(255,0,255),(255,80,0),(0,255,255)]
out=P*0.45
for i,n in enumerate(names):
    try: m=np.array(Image.open(f'{code}/m_{n}.png').convert('L'))>127
    except: continue
    c=np.array(cols[i%len(cols)],np.float32); out[m]=P[m]*0.55+c*0.45
Image.fromarray(out.astype(np.uint8)).resize((int(941*sc),int(1672*sc))).save(f'/tmp/claude-0/-home-claude/01da59ac-3903-517e-934e-a8630e314317/scratchpad/ov_{code}.png')
