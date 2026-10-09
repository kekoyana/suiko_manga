"""Check every catalog/manifest reference without changing published content."""
import json
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / 'public'

def asset(url):
    path = (PUBLIC / url.lstrip('/')).resolve()
    assert path.is_relative_to(PUBLIC), f'Outside public/: {url}'
    assert path.is_file(), f'Missing: {url}'
    return path

catalog = json.loads(asset('/data/catalog.json').read_text())
total = 0
images = set()
numbers = set()
for chapter in catalog['chapters']:
    assert chapter['number'] not in numbers, 'Duplicate chapter number'
    numbers.add(chapter['number'])
    if not chapter['pageCount']:
        continue
    images.add(asset(chapter['cover']))
    data = json.loads(asset(chapter['manifest']).read_text())
    assert data['number'] == chapter['number']
    assert data['status'] == chapter['status']
    assert len(data['pages']) == chapter['pageCount']
    for number, page in enumerate(data['pages'], 1):
        assert page['number'] == number
        assert page['width'] > 0 and page['height'] > 0
        images.add(asset(page['src']))
    total += len(data['pages'])
assert total == catalog['totalPages'], (total, catalog['totalPages'])
for path in images:
    with path.open('rb') as stream:
        header = stream.read(12)
    assert header[:4] == b'RIFF' and header[8:12] == b'WEBP', f'Invalid WebP: {path}'
print(f'OK: {len(numbers)} chapters, {total} pages, {len(images)} referenced WebP files')
