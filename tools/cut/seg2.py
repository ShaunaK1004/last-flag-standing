import sys, json
from rembg import remove, new_session
from PIL import Image
Y0 = 120
im = Image.open('win.png'); s = new_session('sam')
J = json.load(open('prompts2.json'))
for name in sys.argv[1:]:
    pr = []
    for p in J[name]:
        if p[0] == 'box': pr.append({'type': 'rectangle', 'data': [p[1], p[2] - Y0, p[3], p[4] - Y0], 'label': 1})
        else: pr.append({'type': 'point', 'data': [p[1], p[2] - Y0], 'label': p[3]})
    remove(im, session=s, sam_prompt=pr, only_mask=True).save(f'm2_{name}.png'); print(name, 'ok', flush=True)
