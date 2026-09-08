"""Review existing images at runtime scale; this script does not author artwork."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
assets = json.loads((root / 'src/ui/storySettingAssets.json').read_text())
out = root / 'docs/dong-ho-story-settings'
out.mkdir(parents=True, exist_ok=True)
board = Image.new('RGB', (1152, 992), '#f3ecd8')
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
for i, (key, filename) in enumerate(assets.items()):
    x, y = (i % 3) * 384, (i // 3) * 248
    with Image.open(root / 'public/art/story-prints' / filename) as image:
        image = image.resize((368, 207), Image.Resampling.LANCZOS)
        board.paste(image, (x + 8, y + 8))
    draw.text((x + 12, y + 220), key.removeprefix('setting-').title(), fill='#2a2118', font=font)
board.save(out / 'all-settings.jpg', quality=92)
print(out / 'all-settings.jpg')
