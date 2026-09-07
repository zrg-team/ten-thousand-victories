"""Lossless 2048px screen-family atlas packer. Input is the exported CONQUEST_MAP_ART registry.
Run: python scripts/pack-game-art.py path/to/registry.json [--check]
No trimming, rotation or resampling; two extruded pixels protect linear filtering.
"""
import json, sys, math
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
assets = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
check = '--check' in sys.argv
out = root / 'public/art/atlases'
if not check: out.mkdir(parents=True, exist_ok=True)
manifest = {}
families = sorted({a['family'] for a in assets})
for family in families:
    unique = {}
    for asset in assets:
        if asset['family'] == family and asset.get('accepted') and asset.get('path') and asset.get('textureKey'):
            unique.setdefault(asset['path'], []).append(asset)
    pending = [(path, aliases, Image.open(root/'public'/path).convert('RGBA')) for path, aliases in unique.items()]
    pending.sort(key=lambda item: (-item[2].height, -item[2].width, item[0]))
    page_index = 0
    while pending:
        placed, remaining = [], []
        x = y = row = width = 0
        for path, aliases, im in pending:
            w, h = im.width + 4, im.height + 4
            if w > 2048 or h > 2048: raise ValueError(f'Oversized art: {path}')
            if x + w > 2048: x = 0; y += row; row = 0
            if y + h > 2048: remaining.append((path, aliases, im)); continue
            placed.append((path, aliases, im, x+2, y+2)); x += w; row = max(row,h); width=max(width,x)
        height=y+row
        page=f'{family}-{page_index}'
        key=f'conquest-atlas:{page}'
        image=Image.new('RGBA',(width,height))
        frames={}
        for path, aliases, im, x, y in placed:
            image.paste(im,(x,y))
            # Extrude all four edges and corners without modifying the original frame.
            image.paste(im.crop((0,0,1,im.height)).resize((2,im.height)),(x-2,y))
            image.paste(im.crop((im.width-1,0,im.width,im.height)).resize((2,im.height)),(x+im.width,y))
            image.paste(image.crop((x-2,y,x+im.width+2,y+1)).resize((im.width+4,2)),(x-2,y-2))
            image.paste(image.crop((x-2,y+im.height-1,x+im.width+2,y+im.height)).resize((im.width+4,2)),(x-2,y+im.height))
            for asset in aliases:
                name=asset['textureKey']
                frames[name]={'frame':{'x':x,'y':y,'w':im.width,'h':im.height},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':im.width,'h':im.height},'sourceSize':{'w':im.width,'h':im.height}}
                manifest[name]={'page':key,'frame':name,'width':im.width,'height':im.height,'family':family,'image':f'art/atlases/{page}.png','atlas':f'art/atlases/{page}.json'}
        data={'frames':frames,'meta':{'image':f'{page}.png','scale':'1','size':{'w':width,'h':height}}}
        if check:
            actual=Image.open(out/f'{page}.png').convert('RGBA')
            assert actual.size==image.size and actual.tobytes()==image.tobytes(),page
            assert json.loads((out/f'{page}.json').read_text())==data,page
        else:
            image.save(out/f'{page}.png',optimize=True)
            (out/f'{page}.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
        print(page,len(frames),width,height)
        pending=remaining;page_index+=1
if check: assert json.loads((root/'src/ui/conquestAtlasPages.json').read_text())==manifest
else: (root/'src/ui/conquestAtlasPages.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Verified' if check else 'Packed',len(manifest),'asset identities, source pixels unchanged')
