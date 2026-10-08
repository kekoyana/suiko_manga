"""Stage public/ byte-for-byte, except for the deployment-specific 404 home URL."""
import argparse
import html
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-path', default='', help='e.g. /suiko_manga; empty for a root/custom domain')
args = parser.parse_args()
base = '/' + args.base_path.strip('/') if args.base_path.strip('/') else ''
if any(part in ('.', '..') for part in base.split('/')) or any(c in base for c in '?#\\'):
    parser.error('base-path must be a URL path without query, fragment or dot segments')
destination = ROOT / '_site'
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(ROOT / 'public', destination)
page = destination / '404.html'
content = page.read_text(encoding='utf-8')
marker = 'id="home-link" href="./"'
if content.count(marker) != 1:
    raise SystemExit('404 home link marker missing or duplicated')
page.write_text(content.replace(marker, f'id="home-link" href="{html.escape(base + "/", quote=True)}"'), encoding='utf-8')
(destination / '.nojekyll').touch()
print(f'Staged public/ at {destination}, home URL: {base}/')
