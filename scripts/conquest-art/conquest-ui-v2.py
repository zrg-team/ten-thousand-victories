"""Pack generated functional icons and preserve the original dynasty sign pixels.

Only framing, scaling and atlas packing; no procedural repainting.
Usage: conquest-ui-v2.py export <id> <generated.png> | pack [--partial]
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'output/conquest-ui-v2'
DOCS = ROOT / 'docs/art/conquest-ui-v2'
RUNTIME = ROOT / 'public/art/conquest-ui-icons'
PROMPTS = ROOT / 'docs/art/conquest-ui-v2-prompts.json'
JOBS = json.loads(PROMPTS.read_text(encoding='utf-8'))['jobs']
HISTORICAL_IDS = {j['id'] for j in json.loads((ROOT / 'docs/art/conquest-ui-history-refinements.json').read_text(encoding='utf-8'))['jobs']}
LOG = DOCS / 'generation.json'
SIZE, GAP, STEP = 120, 4, 128
RETAIN = ['person', 'crown', 'purse', 'wall', 'scroll', 'blade', 'banner', 'spark', 'herd', 'hut', 'branch', 'ladder']
SIGNS = ['bronze-drum', 'banner', 'blade', 'grain', 'bamboo', 'turtle', 'lotus', 'lac-bird',
         'dragon', 'phoenix', 'tiger', 'herd', 'carp', 'terrain', 'wave', 'star']


def export(icon_id, source):
    assert any(j['id'] == icon_id for j in JOBS), icon_id
    master = WORK / 'masters' / f'{icon_id}.png'
    master.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, master)
    image = Image.open(master).convert('RGBA')
    alpha = image.getchannel('A')
    assert alpha.getextrema() == (0, 255), f'{icon_id}: genuine generated alpha required'
    bounds = alpha.point(lambda a: 255 if a > 10 else 0).getbbox()
    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < image.width and bounds[3] < image.height, f'{icon_id}: clipped'
    # ImageGen can leave near-transparent specks far outside the actual print.
    # Frame the visible silhouette with four source pixels of edge allowance, so
    # invisible margin specks do not shrink a book or hand to half its UI size.
    # Preserve every original RGBA pixel inside this rectangular crop, including holes.
    crop = (max(0, bounds[0]-4), max(0, bounds[1]-4), min(image.width, bounds[2]+4), min(image.height, bounds[3]+4))
    fitted = ImageOps.contain(image.crop(crop), (108, 108), Image.Resampling.LANCZOS)
    part = Image.new('RGBA', (SIZE, SIZE))
    part.paste(fitted, ((SIZE - fitted.width) // 2, (SIZE - fitted.height) // 2))
    (WORK / 'parts').mkdir(parents=True, exist_ok=True)
    part.save(WORK / 'parts' / f'{icon_id}.png', optimize=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    log = json.loads(LOG.read_text(encoding='utf-8')) if LOG.exists() else {'mode': 'built-in ImageGen', 'assets': []}
    log['assets'] = [a for a in log['assets'] if a['id'] != icon_id]
    log['assets'].append({'id': icon_id, 'generatedSource': str(source), 'master': master.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(master.read_bytes()).hexdigest(), 'alpha': 'generated, preserved inside rectangular crop', 'crop': crop,
        'prompt': f'docs/art/{"conquest-ui-history-refinements" if icon_id in HISTORICAL_IDS else "conquest-ui-v2-prompts"}.json#{icon_id}'})
    LOG.write_text(json.dumps(log, indent=2) + '\n', encoding='utf-8')
    print(f'{icon_id}: alpha preserved, {len(log["assets"])}/{len(JOBS)} exported')


def single_chevron(source):
    # Keep one intact connected glyph from the generated pair, including edge alpha.
    pixels = source.load()
    remaining = {(x, y) for y in range(SIZE) for x in range(SIZE) if pixels[x, y][3] > 0}
    islands = []
    while remaining:
        seed = remaining.pop()
        island, queue = {seed}, [seed]
        while queue:
            x, y = queue.pop()
            for neighbor in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    island.add(neighbor)
                    queue.append(neighbor)
        islands.append(island)
    largest = sorted(islands, key=len, reverse=True)[:2]
    assert len(largest) == 2 and min(map(len, largest)) > 100, 'Chevrons must remain separated'
    upper = min(largest, key=lambda island: sum(y for _, y in island) / len(island))
    isolated = Image.new('RGBA', source.size)
    for x, y in upper:
        isolated.putpixel((x, y), pixels[x, y])
    fitted = ImageOps.contain(isolated.crop(isolated.getchannel('A').getbbox()), (108, 108), Image.Resampling.LANCZOS)
    part = Image.new('RGBA', (SIZE, SIZE))
    part.paste(fitted, ((SIZE-fitted.width)//2, (SIZE-fitted.height)//2))
    return part


def write_atlas(parts, name, side, aliases=None):
    assert len(parts) <= (side // STEP) ** 2
    atlas = Image.new('RGBA', (side, side))
    frames = {}
    for i, (icon_id, image) in enumerate(parts.items()):
        x, y = (i % (side // STEP)) * STEP + GAP, (i // (side // STEP)) * STEP + GAP
        atlas.paste(image, (x, y))
        frames[icon_id] = {'frame': {'x': x, 'y': y, 'w': SIZE, 'h': SIZE}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': SIZE, 'h': SIZE}, 'sourceSize': {'w': SIZE, 'h': SIZE}}
    for alias, original in (aliases or {}).items():
        frames[alias] = frames[original]
    atlas.save(RUNTIME / f'{name}.png', optimize=True)
    (RUNTIME / f'{name}.json').write_text(json.dumps({'frames': frames, 'meta': {'image': f'{name}.png',
        'format': 'RGBA8888', 'size': {'w': side, 'h': side}, 'scale': '1'}}, indent=2) + '\n')
    print(f'{name}: {len(parts)} artworks, {len(frames)} meanings, {(RUNTIME / f"{name}.png").stat().st_size} bytes')


def review(parts):
    sheet = Image.new('RGB', (1000, ((len(parts)+5)//6)*178), '#f3ecd8')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
    for i, (icon_id, part) in enumerate(parts.items()):
        x, y = (i % 6)*166+23, (i//6)*178
        large = part.resize((96, 96), Image.Resampling.LANCZOS)
        sheet.paste(large, (x+12, y), large)
        for size, dx in [(18, 14), (26, 45), (36, 82)]:
            small = part.resize((size, size), Image.Resampling.LANCZOS)
            sheet.paste(small, (x+dx, y+101), small)
        draw.text((x+5, y+146), icon_id, fill='#2a2118', font=font)
    DOCS.mkdir(parents=True, exist_ok=True)
    sheet.save(DOCS / 'all-icons.png')


def pack(partial=False):
    old = Image.open(RUNTIME / 'icons-v1.png').convert('RGBA')
    old_frames = json.loads((RUNTIME / 'icons-v1.json').read_text())['frames']
    def previous(icon_id):
        f = old_frames[icon_id]['frame']
        return old.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
    # Exact pixel copies keep every saved flag/sign design unchanged.
    signs = {icon_id: previous(icon_id) for icon_id in SIGNS}
    write_atlas(signs, 'signs-v1', 512)
    parts = {icon_id: previous(icon_id) for icon_id in RETAIN}
    for job in JOBS:
        path = WORK / 'parts' / f'{job["id"]}.png'
        if not path.exists() and partial:
            if job['id'] in old_frames:
                parts[job['id']] = previous(job['id'])
            continue
        parts[job['id']] = Image.open(path).convert('RGBA')
    for direction in ['up', 'down']:
        parts[f'chevron-{direction}'] = single_chevron(parts[f'chevrons-{direction}'])
    write_atlas(parts, 'icons-v2', 1024, {'balance': 'scales', 'food': 'grain', 'gold': 'coin'})
    review(parts)


if __name__ == '__main__':
    if sys.argv[1] == 'export':
        export(*sys.argv[2:4])
    elif sys.argv[1] == 'pack':
        pack(partial='--partial' in sys.argv)
    else:
        raise ValueError('Expected export or pack')
