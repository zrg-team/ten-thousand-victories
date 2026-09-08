"""Preserve generated alpha, resize complete motifs, and pack the story choice atlas.

Usage: story-choice-icons.py export <id> <generated.png> | pack
Only mechanical asset preparation; the motifs are drawn by built-in ImageGen.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
JOBS = json.loads((ROOT / 'docs/dong-ho-story-icon-prompts.json').read_text(encoding='utf-8'))['jobs']
WORK = ROOT / 'output/story-choice-icons'
RUNTIME = ROOT / 'public/art/story-choice-icons'
LOG_PATH = ROOT / 'docs/dong-ho-story-icon-generation-log.json'
SIZE, GAP, COLUMNS = 160, 4, 4

def export(icon_id, source):
    job = next(j for j in JOBS if j['id'] == icon_id)
    master = WORK / 'masters' / f'{icon_id}.png'
    part = WORK / 'parts' / f'{icon_id}.png'
    master.parent.mkdir(parents=True, exist_ok=True)
    part.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, master)
    with Image.open(master) as original:
        image = original.convert('RGBA')
        alpha = image.getchannel('A')
        # Reject opaque or empty outputs; never fake transparency by colour-keying the artwork.
        if alpha.getextrema() != (0, 255):
            raise ValueError(f'{icon_id}: needs real generated alpha, got {alpha.getextrema()}')
        visible = alpha.getbbox()
        # Near-invisible generated alpha specks are not a clipped silhouette. Use a
        # threshold only to validate framing; retain the original pixels below.
        silhouette = alpha.point(lambda a: 255 if a > 10 else 0).getbbox()
        if not silhouette or silhouette[0] <= 0 or silhouette[1] <= 0 or silhouette[2] >= image.width or silhouette[3] >= image.height:
            raise ValueError(f'{icon_id}: motif touches edge; regenerate with a complete transparent margin')
        # Remove empty alpha margin only, then give all silhouettes the same optical box.
        fitted = ImageOps.contain(image.crop(visible), (SIZE - 16, SIZE - 16), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE))
        canvas.paste(fitted, ((SIZE - fitted.width) // 2, (SIZE - fitted.height) // 2))
        canvas.save(part, optimize=True)
    log = json.loads(LOG_PATH.read_text(encoding='utf-8')) if LOG_PATH.exists() else {'mode': 'built-in ImageGen', 'assets': []}
    log['assets'] = [a for a in log['assets'] if a['id'] != icon_id]
    log['assets'].append({'id': icon_id, 'generatedSource': source, 'master': master.relative_to(ROOT).as_posix(),
        'part': part.relative_to(ROOT).as_posix(), 'runtime': 'public/art/story-choice-icons/icons-v1.png',
        'frame': icon_id, 'width': SIZE, 'height': SIZE, 'alpha': 'generated, preserved',
        'sha256': hashlib.sha256(part.read_bytes()).hexdigest(), 'prompt': f'docs/dong-ho-story-icon-prompts.json#{icon_id}'})
    LOG_PATH.write_text(json.dumps(log, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(log["assets"])}/{len(JOBS)}: {icon_id} exported with original alpha')

def pack():
    step = SIZE + GAP * 2
    rows = (len(JOBS) + COLUMNS - 1) // COLUMNS
    atlas = Image.new('RGBA', (step * COLUMNS, step * rows))
    frames = {}
    review = Image.new('RGB', (800, rows * 240), '#f3ecd8')
    draw = ImageDraw.Draw(review)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
    for i, job in enumerate(JOBS):
        icon_id = job['id']
        image = Image.open(WORK / 'parts' / f'{icon_id}.png').convert('RGBA')
        x, y = (i % COLUMNS) * step + GAP, (i // COLUMNS) * step + GAP
        atlas.paste(image, (x, y))
        frames[icon_id] = {'frame': {'x': x, 'y': y, 'w': SIZE, 'h': SIZE}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': SIZE, 'h': SIZE}, 'sourceSize': {'w': SIZE, 'h': SIZE}}
        rx, ry = (i % COLUMNS) * 200 + 20, (i // COLUMNS) * 240
        review.paste(image, (rx, ry), image)
        small = image.resize((36, 36), Image.Resampling.LANCZOS)
        review.paste(small, (rx + 62, ry + 162), small)
        draw.text((rx + 18, ry + 204), icon_id.title(), fill='#2a2118', font=font)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    atlas.save(RUNTIME / 'icons-v1.png', optimize=True)
    (RUNTIME / 'icons-v1.json').write_text(json.dumps({'frames': frames, 'meta': {'image': 'icons-v1.png',
        'format': 'RGBA8888', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}}, indent=2) + '\n')
    review_dir = ROOT / 'docs/dong-ho-story-icons'
    review_dir.mkdir(parents=True, exist_ok=True)
    review.save(review_dir / 'all-icons.png')
    print(f'{len(frames)} frames, {atlas.width}x{atlas.height}, {(RUNTIME / "icons-v1.png").stat().st_size} bytes')

if sys.argv[1] == 'export':
    export(*sys.argv[2:4])
elif sys.argv[1] == 'pack':
    pack()
else:
    raise ValueError('Expected export or pack')
