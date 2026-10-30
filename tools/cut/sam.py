# usage: python3 sam.py CODE name  (prompts from CODE/prompts.json[name]); one SAM job per process
import sys, json
from rembg import remove, new_session
from PIL import Image
code, names = sys.argv[1], sys.argv[2:]
im = Image.open(f'{code}/poster.png').convert('RGB'); s = new_session('sam')
J = json.load(open(f'{code}/prompts.json'))
for name in names:
    pr = []
    for p in J[name]:
        if p[0] == 'box': pr.append({'type': 'rectangle', 'data': p[1:5], 'label': 1})
        else: pr.append({'type': 'point', 'data': p[1:3], 'label': p[3]})
    remove(im, session=s, sam_prompt=pr, only_mask=True).save(f'{code}/m_{name}.png'); print(code, name, 'ok', flush=True)
