import concurrent.futures, datetime, hashlib, json, pathlib, subprocess, urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
base="https://kekoyana.github.io/suiko_manga/"
files=sorted((root/"public/assets/ch044").rglob("*.webp"))+list((root/"public/data").glob("ch044-*.json"))+[root/"public/data/catalog.json"]
def check(p):
    rel=p.relative_to(root/"public").as_posix()
    req=urllib.request.Request(base+rel,headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=90) as r: data=r.read()
    local=p.read_bytes()
    assert data==local,rel
    return {"path":p.relative_to(root).as_posix(),"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: verified=list(pool.map(check,files))
commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
result={"chapter":44,"baseUrl":base,"checkedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"commit":commit,"completedThrough":44,"totalPages":1697,"files":verified,"filesMatched":len(verified)}
(root/"production/ch044-publication-validation.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print("All",len(verified),"published files match SHA256 and bytes")
