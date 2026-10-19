import sys
from PIL import Image
codes=sys.argv[1].split(','); out=sys.argv[2]
ims=[]
for c in codes:
    im=Image.open(f'{c}/check.png'); w=im.width//3
    ims.append(im.crop((w,0,3*w,im.height)))   # bg | layers
S=Image.new('RGB',(ims[0].width*len(ims)//1, ims[0].height)) if False else None
cols=len(ims); W=ims[0].width; H=ims[0].height
S=Image.new('RGB',(W*min(cols,3),H*((cols+2)//3)),(0,0,0))
for i,im in enumerate(ims): S.paste(im,((i%3)*W,(i//3)*H))
S.save(out)
