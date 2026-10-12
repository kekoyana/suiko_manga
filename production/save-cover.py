from pathlib import Path
from PIL import Image
import hashlib,json,sys
root=Path(__file__).resolve().parent.parent
c=int(sys.argv[1]);source=Path(sys.argv[2])
im=Image.open(source).convert('RGB')
temp=root/f'public/assets/ch{c:03}/cover-pending.webp'
im.save(temp,'WEBP',lossless=True,method=0)
assert Image.open(temp).convert('RGB').tobytes()==im.tobytes()
digest=hashlib.sha256(temp.read_bytes()).hexdigest()
output=temp.with_name('cover-'+digest[:16]+'.webp');temp.rename(output)
record=root/f'production/ch{c:03}-generation-records.json'
data=json.loads(record.read_text())
data['cover']={'sourceImage':str(source),'output':str(output.relative_to(root)),'width':im.width,'height':im.height,'sha256':digest,'pixelMatch':True}
record.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f'Cover {c} saved, pixels verified')
