"""Preserve generated page pixels in lossless delivery assets and record provenance."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
chapter = int(sys.argv[1])
number = int(sys.argv[2])
source = Path(sys.argv[3])
plan = json.loads((ROOT / f'production/ch{chapter:03}-pages.json').read_text())
page = plan['pages'][number - 1]
output = ROOT / f'public/assets/ch{chapter:03}/complete/p{number:03}.webp'
output.parent.mkdir(parents=True, exist_ok=True)
image = Image.open(source).convert('RGB')
image.save(output, 'WEBP', lossless=True, method=0)
with Image.open(output) as saved:
    assert saved.convert('RGB').tobytes() == image.tobytes()
records_path = ROOT / f'production/ch{chapter:03}-generation-records.json'
records = json.loads(records_path.read_text()) if records_path.exists() else {
    'tool': 'built-in image_gen', 'format': 'lossless WebP', 'pages': []}
previous = next((p for p in records['pages'] if p['number'] == number), None)
if previous:
    records.setdefault('previousVersions', []).append(previous)
records['pages'] = [p for p in records['pages'] if p['number'] != number]
records['pages'].append({
    'number': number, 'title': page['title'], 'sourceImage': str(source),
    'output': str(output.relative_to(ROOT)), 'width': image.width, 'height': image.height,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'pixelMatch': True})
records['pages'].sort(key=lambda p: p['number'])
records_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
print(f'Saved page {number}; lossless pixels verified')
