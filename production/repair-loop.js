async function(){
const root=load("root"),save=eval("("+load("saveCode")+")"),q=eval("("+load("qShell")+")");
const jobs=load("repairs26");
for(const p of jobs){
 const target=root+"/public/assets/ch026/complete/p"+String(p.number).padStart(3,"0")+".webp";
 const viewed=await tools.view_image({path:target});image(viewed.image_url);
 const prompt="既存の完成漫画ページの限定修正。"+p.instruction+" 指定箇所以外は可能な限り画素と同じ配置・色・人物・台詞を保つ。";
 const r=await tools.image_gen__imagegen({prompt,referenced_image_paths:[target],transparent_background:false});
 const source=r.output_hint.match(/as (\/[^\s]+\.png) by default/)[1];
 text(await save("python3 production/save-page.py 26 "+p.number+" "+source));
 const py="import json,pathlib\np=pathlib.Path('production/ch026-generation-records.json');d=json.loads(p.read_text());x=next(x for x in d['pages'] if x['number']=="+p.number+");x['repairPrompt']="+JSON.stringify(prompt)+";p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\\n')";
 text(await save("python3 -c "+q(py)));
 generatedImage(r);notify("第26回 "+p.number+"ページの修正を保存");await yield_control();
}
store("repairs26Done",true)
}