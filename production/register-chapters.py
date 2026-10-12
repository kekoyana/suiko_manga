"""Register only fully verified new chapters in the reader catalog."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent.parent
titles={26:'鄆哥、茶店で騒ぎを起こす／武松、兄の仇を討つ',27:'母夜叉、孟州道で酒を売る／武都頭、十字坡で張青に会う',28:'武松、安平寨に入る／施恩、快活林を取り戻そうとする',29:'施恩、重ねて義を結ぶ／武松、酔って蔣門神を打つ',30:'施恩、三たび死囚牢を訪れる／武松、飛雲浦で大立ち回り'}
counts={26:40,27:28,28:20,29:20,30:32}
catalog_path=ROOT/'public/data/catalog.json'
catalog=json.loads(catalog_path.read_text())
for c in range(26,31):
 records=json.loads((ROOT/f'production/ch{c:03}-generation-records.json').read_text())
 assert [p['number'] for p in records['pages']]==list(range(1,counts[c]+1)),c
 pages=[]
 for p in records['pages']:
  asset=ROOT/p['output']
  assert asset.stat().st_size>0 and p['pixelMatch']
  assert hashlib.sha256(asset.read_bytes()).hexdigest()==p['sha256']
  pages.append({'number':p['number'],'src':'/'+p['output'].removeprefix('public/'),'width':p['width'],'height':p['height']})
 cover=records['cover']
 assert (ROOT/cover['output']).is_file()
 manifest={'number':c,'title':titles[c],'status':'complete','pages':pages}
 data=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 name=f'ch{c:03}-'+hashlib.sha256(data).hexdigest()[:12]+'.json'
 (ROOT/'public/data'/name).write_bytes(data)
 chapter=next(x for x in catalog['chapters'] if x['number']==c)
 chapter.update(title=titles[c],status='complete',pageCount=counts[c],cover='/'+cover['output'].removeprefix('public/'),manifest='/data/'+name)
catalog['completedThrough']=30
catalog['totalPages']=sum(c['pageCount'] for c in catalog['chapters'])
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(f"Completed through 30, {catalog['totalPages']} pages")
