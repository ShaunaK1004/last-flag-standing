import sys, json
from rembg import remove, new_session
from PIL import Image
Y0 = 120
name = sys.argv[1]
im = Image.open('win.png')
s = new_session('sam')
pts = json.load(open('points.json'))[name]
prompt = [{'type': 'point', 'data': [x, y - Y0], 'label': l} for x, y, l in pts]
remove(im, session=s, sam_prompt=prompt, only_mask=True).save(f'm_{name}.png'); print(name, 'ok')
