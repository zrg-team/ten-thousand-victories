"""Preserve ImageGen masters, then resize/encode the complete prints for the game."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
setting, source = sys.argv[1:3]
jobs = json.loads((ROOT / 'docs/dong-ho-story-setting-prompts.json').read_text(encoding='utf-8'))['jobs']
job = next(job for job in jobs if job['id'] == setting)
master = ROOT / 'output/story-settings/masters' / f'{setting}.png'
master.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, master)
target = ROOT / job['output']
with Image.open(master) as original:
    # Mechanical containment only. No artwork is cropped, repainted or stretched.
    fitted = ImageOps.contain(original.convert('RGB'), (768, 432), Image.Resampling.LANCZOS)
    page = Image.new('RGB', (768, 432), '#f3ecd8')
    page.paste(fitted, ((768 - fitted.width) // 2, (432 - fitted.height) // 2))
    page.save(target, 'WEBP', quality=88, method=6)
log_path = ROOT / 'docs/dong-ho-story-setting-generation-log.json'
log = json.loads(log_path.read_text(encoding='utf-8')) if log_path.exists() else {'mode': 'built-in ImageGen', 'assets': []}
log['assets'] = [a for a in log['assets'] if a['id'] != setting]
log['assets'].append({
    'id': setting, 'generatedSource': source, 'master': master.relative_to(ROOT).as_posix(),
    'runtime': job['output'], 'width': 768, 'height': 432, 'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'prompt': f'docs/dong-ho-story-setting-prompts.json#{setting}',
})
log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(log["assets"])}/12 saved: {target.relative_to(ROOT)} ({target.stat().st_size} bytes)')
