"""Frame generated historical replacements and repack the preceding UI atlas.

Usage: conquest-ui-v3.py [--revision 3|4|5] export <id> <generated.png> | pack
Only rectangular framing, scaling and packing; source RGBA remains unpainted.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
REVISION = 3
if '--revision' in sys.argv:
    option = sys.argv.index('--revision')
    REVISION = int(sys.argv[option + 1])
    del sys.argv[option:option + 2]
assert REVISION in (3, 4, 5), 'Supported revisions: 3, 4, 5'
NAME = f'icons-v{REVISION}'
WORK = ROOT / f'output/conquest-ui-v{REVISION}'
DOCS = ROOT / f'docs/art/conquest-ui-v{REVISION}'
RUNTIME = ROOT / 'public/art/conquest-ui-icons'
PROMPT = f'docs/art/conquest-ui-v{REVISION}-prompts.json'
JOBS = json.loads((ROOT / PROMPT).read_text(encoding='utf-8-sig'))['jobs']
SIZE = 120


def export(icon_id, source):
    job = next(j for j in JOBS if j['id'] == icon_id)
    master = WORK / 'masters' / f'{icon_id}.png'
    master.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, master)
    art = Image.open(master).convert('RGBA')
    alpha = art.getchannel('A')
    alpha_min, alpha_max = alpha.getextrema()
    # Generated cutouts can peak at 254; keep that native alpha instead of normalizing it.
    assert alpha_min == 0 and alpha_max >= 250, f'{icon_id}: genuine generated alpha required'
    bounds = alpha.point(lambda a: 255 if a > 10 else 0).getbbox()
    assert bounds and min(bounds[:2]) > 0 and bounds[2] < art.width and bounds[3] < art.height, f'{icon_id}: clipped art'
    # Ignore nearly transparent exterior dust when choosing the rectangular frame.
    # Preserve original alpha, holes, pigments and edge pixels inside that frame.
    crop = (max(0, bounds[0]-4), max(0, bounds[1]-4), min(art.width, bounds[2]+4), min(art.height, bounds[3]+4))
    framing = None
    if REVISION == 5 and 'sizing' in job:
        sizing = job['sizing']
        unit_height = 60 * sizing.get('poseHeightFactor', 1)
        scale = unit_height / sizing['unitHeight']
        dimensions = (round((crop[2]-crop[0])*scale), round((crop[3]-crop[1])*scale))
        assert max(dimensions) <= 112, f'{icon_id}: composition is too wide for matched troop scale'
        fitted = art.crop(crop).resize(dimensions, Image.Resampling.LANCZOS)
        framing = {'sourceUnitHeight': sizing['unitHeight'], 'targetUnitHeight': unit_height,
                   'poseHeightFactor': sizing.get('poseHeightFactor', 1), 'scale': scale,
                   'fittedSize': dimensions}
    else:
        fitted = ImageOps.contain(art.crop(crop), (108, 108), Image.Resampling.LANCZOS)
    part = Image.new('RGBA', (SIZE, SIZE))
    part.paste(fitted, ((SIZE-fitted.width)//2, (SIZE-fitted.height)//2))
    (WORK / 'parts').mkdir(parents=True, exist_ok=True)
    part.save(WORK / 'parts' / f'{icon_id}.png', optimize=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    path = DOCS / 'generation.json'
    log = json.loads(path.read_text()) if path.exists() else {'mode': 'built-in ImageGen', 'assets': []}
    job_ids = {j['id'] for j in JOBS}
    log['assets'] = [a for a in log['assets'] if a['id'] in job_ids and a['id'] != icon_id]
    log['assets'].append({'id': icon_id, 'generatedSource': str(source), 'master': master.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(master.read_bytes()).hexdigest(), 'crop': crop,
        'alpha': 'generated, preserved inside rectangular crop', 'prompt': f'{PROMPT}#{icon_id}',
        **({'troopFraming': framing} if framing else {})})
    path.write_text(json.dumps(log, indent=2) + '\n')
    print(f'{icon_id}: alpha preserved, {len(log["assets"])}/{len(JOBS)} exported')


def review(parts):
    review_ids = (['spears', 'horse', 'skirmish', 'tortoise', 'bows', 'crossed-weapons']
                  if REVISION >= 4 else [job['id'] for job in JOBS])
    sheet = Image.new('RGB', (180 * len(review_ids), 264), '#f3ecd8')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
    labels = {'supplies': 'Materials', 'spears': 'Brace spears', 'horse': 'Charge',
              'skirmish': 'Spread', 'tortoise': 'Raise shields', 'bows': 'Shoot', 'crossed-weapons': 'Fight'}
    for i, icon_id in enumerate(review_ids):
        x, part = i * 180, parts[icon_id]
        draw.text((x + 15, 12), labels[icon_id], fill='#2a2118', font=font)
        sheet.paste(part, (x + 30, 38), part)
        for size, offset in [(15, 14), (18, 46), (30, 81), (42, 126)]:
            small = part.resize((size, size), Image.Resampling.LANCZOS)
            sheet.paste(small, (x + offset, 180 + (42-size)//2), small)
            draw.text((x + offset, 234), str(size), fill='#5f5542', font=font)
    sheet.save(DOCS / 'historical-icons.png')


def pack():
    old = Image.open(RUNTIME / f'icons-v{REVISION - 1}.png').convert('RGBA')
    metadata = json.loads((RUNTIME / f'icons-v{REVISION - 1}.json').read_text())
    atlas = old.copy()
    parts = {}
    for job in JOBS:
        icon_id = job['id']
        part = Image.open(WORK / 'parts' / f'{icon_id}.png').convert('RGBA')
        f = metadata['frames'][icon_id]['frame']
        assert part.size == (f['w'], f['h']) == (SIZE, SIZE)
        atlas.paste(part, (f['x'], f['y']))
        parts[icon_id] = part
    # Preserve all other frame pixels and coordinates, including the three aliases.
    for icon_id, frame in metadata['frames'].items():
        if icon_id in parts:
            continue
        f = frame['frame']
        box = (f['x'], f['y'], f['x']+f['w'], f['y']+f['h'])
        assert atlas.crop(box).tobytes() == old.crop(box).tobytes(), icon_id
    atlas.save(RUNTIME / f'{NAME}.png', optimize=True)
    metadata['meta']['image'] = f'{NAME}.png'
    (RUNTIME / f'{NAME}.json').write_text(json.dumps(metadata, indent=2) + '\n')
    review_parts = dict(parts)
    if REVISION == 4:
        f = metadata['frames']['spears']['frame']
        review_parts['spears'] = atlas.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
    review(review_parts)
    print(f'{NAME}: {len(parts)} replacements, {len(metadata["frames"]) - len(parts)} other frames pixel-identical, {(RUNTIME / f"{NAME}.png").stat().st_size} bytes')


if __name__ == '__main__':
    if sys.argv[1] == 'export':
        export(*sys.argv[2:4])
    elif sys.argv[1] == 'pack':
        pack()
    else:
        raise ValueError('Expected export or pack')
