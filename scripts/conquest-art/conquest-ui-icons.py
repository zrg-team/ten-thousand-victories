"""Mechanically preserve, resize and atlas-pack ImageGen icons; never repaint pixels.

Usage: conquest-ui-icons.py export <id> <generated.png> | pack
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'output/conquest-ui-icons'
DOCS = ROOT / 'docs/art/conquest-ui-icons'
RUNTIME = ROOT / 'public/art/conquest-ui-icons'
JOBS = json.loads((ROOT / 'docs/art/conquest-ui-icon-prompts.json').read_text(encoding='utf-8'))['jobs']
LOG = DOCS / 'generation.json'
SIZE, GAP, STEP = 120, 4, 128


def export(icon_id, source):
    assert any(j['id'] == icon_id for j in JOBS), icon_id
    master = WORK / 'masters' / f'{icon_id}.png'
    master.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, master)
    image = Image.open(master).convert('RGBA')
    alpha = image.getchannel('A')
    if alpha.getextrema() != (0, 255):
        raise ValueError(f'{icon_id}: requires genuine generated transparency, got {alpha.getextrema()}')
    silhouette = alpha.point(lambda a: 255 if a > 10 else 0).getbbox()
    if not silhouette or silhouette[0] == 0 or silhouette[1] == 0 or silhouette[2] == image.width or silhouette[3] == image.height:
        raise ValueError(f'{icon_id}: clipped silhouette; regenerate with complete margins')
    fitted = ImageOps.contain(image.crop(alpha.getbbox()), (SIZE - 12, SIZE - 12), Image.Resampling.LANCZOS)
    part = Image.new('RGBA', (SIZE, SIZE))
    part.paste(fitted, ((SIZE - fitted.width) // 2, (SIZE - fitted.height) // 2))
    DOCS.mkdir(parents=True, exist_ok=True)
    (WORK / 'parts').mkdir(parents=True, exist_ok=True)
    part_path = WORK / 'parts' / f'{icon_id}.png'
    part.save(part_path, optimize=True)
    log = json.loads(LOG.read_text(encoding='utf-8')) if LOG.exists() else {'mode': 'built-in ImageGen', 'assets': []}
    log['assets'] = [a for a in log['assets'] if a['id'] != icon_id]
    log['assets'].append({'id': icon_id, 'generatedSource': str(source), 'master': master.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(master.read_bytes()).hexdigest(), 'alpha': 'generated, preserved',
        'prompt': f'docs/art/conquest-ui-icon-prompts.json#{icon_id}'})
    LOG.write_text(json.dumps(log, indent=2) + '\n', encoding='utf-8')
    print(f'{icon_id}: alpha preserved, {len(log["assets"])}/{len(JOBS)} generated assets exported')


def pack(partial=False):
    old = Image.open(ROOT / 'public/art/story-choice-icons/icons-v1.png').convert('RGBA')
    old_frames = json.loads((ROOT / 'public/art/story-choice-icons/icons-v1.json').read_text())['frames']
    parts = {}
    for icon_id, entry in old_frames.items():
        f = entry['frame']
        image = old.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        parts[icon_id] = image
    for job in JOBS:
        path = WORK / 'parts' / f'{job["id"]}.png'
        if partial and not path.exists():
            continue
        parts[job['id']] = Image.open(path).convert('RGBA')
    # Extract one intact printed chevron from each double-chevron image. The
    # silhouettes overlap in Y, so a rectangular half-crop would clip the art.
    # Connected alpha islands preserve the generated pixels without repainting.
    for direction in ['up', 'down']:
        source = parts.get(f'chevrons-{direction}')
        if source is None:
            continue
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
        assert len(largest) == 2 and min(map(len, largest)) > 100, direction
        upper = min(largest, key=lambda island: sum(y for _, y in island) / len(island))
        isolated = Image.new('RGBA', source.size)
        target = isolated.load()
        for x, y in upper:
            target[x, y] = pixels[x, y]
        fitted = ImageOps.contain(isolated.crop(isolated.getchannel('A').getbbox()),
                                  (SIZE-12, SIZE-12), Image.Resampling.LANCZOS)
        part = Image.new('RGBA', (SIZE, SIZE))
        part.paste(fitted, ((SIZE-fitted.width)//2, (SIZE-fitted.height)//2))
        parts[f'chevron-{direction}'] = part
    assert len(parts) <= 64, 'Atlas is full; explicitly resize before adding more artwork'
    atlas = Image.new('RGBA', (1024, 1024))
    frames = {}
    review = Image.new('RGB', (1000, ((len(parts) + 5) // 6) * 195), '#f3ecd8')
    draw = ImageDraw.Draw(review)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    for i, (icon_id, image) in enumerate(parts.items()):
        x, y = (i % 8) * STEP + GAP, (i // 8) * STEP + GAP
        atlas.paste(image, (x, y))
        frames[icon_id] = {'frame': {'x': x, 'y': y, 'w': SIZE, 'h': SIZE}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': SIZE, 'h': SIZE}, 'sourceSize': {'w': SIZE, 'h': SIZE}}
        rx, ry = (i % 6) * 166 + 23, (i // 6) * 195
        review.paste(image, (rx, ry), image)
        for size, dx in [(18, 14), (26, 45), (36, 82)]:
            small = image.resize((size, size), Image.Resampling.LANCZOS)
            review.paste(small, (rx + dx, ry + 125), small)
        draw.text((rx + 10, ry + 170), icon_id, fill='#2a2118', font=font)
    # Semantically identical meanings share pixels, rather than duplicating texture memory.
    for alias, original in {'balance': 'scales', 'food': 'grain', 'gold': 'coin'}.items():
        frames[alias] = frames[original]
    RUNTIME.mkdir(parents=True, exist_ok=True)
    atlas.save(RUNTIME / 'icons-v1.png', optimize=True)
    (RUNTIME / 'icons-v1.json').write_text(json.dumps({'frames': frames, 'meta': {'image': 'icons-v1.png',
        'format': 'RGBA8888', 'size': {'w': 1024, 'h': 1024}, 'scale': '1'}}, indent=2) + '\n')
    review.save(DOCS / 'all-icons.png')
    print(f'{len(parts)} artworks, {len(frames)} semantic frames, {(RUNTIME / "icons-v1.png").stat().st_size} bytes')


if sys.argv[1] == 'export':
    export(*sys.argv[2:4])
elif sys.argv[1] == 'pack':
    pack(partial='--partial' in sys.argv)
else:
    raise ValueError('Expected export or pack')
