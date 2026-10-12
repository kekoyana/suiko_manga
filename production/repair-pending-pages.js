async function(){
 const root=load("root"),save=eval("("+load("saveCode")+")"),q=eval("("+load("qShell")+")");
 const data=await tools.exec_command({cmd:"cat production/ch027-ch030-repairs-pending.json",workdir:root,max_output_tokens:4000});
 for(const p of JSON.parse(data.output)){
 const target=root+"/public/assets/ch"+String(p.chapter).padStart(3,"0")+"/complete/p"+String(p.number).padStart(3,"0")+".webp";
 image((await tools.view_image({path:target})).image_url);
 const refs=[target];if([19,20,21].includes(p.number))refs.push(root+"/public/assets/ch027/complete/p022.webp");
 const prompt="既存の完成漫画ページの限定修正。"+p.instruction+" 指定箇所以外の構図、色、台詞は維持。人物は全員成人。二枚目の画像がある場合、そこにいる髭のない灰緑服・灰色服の男性二人が店の手伝いの正しい外見。";
 const r=await tools.image_gen__imagegen({prompt,referenced_image_paths:refs,transparent_background:false});
 const source=r.output_hint.match(/as (\/[^\s]+\.png) by default/)[1];text(await save("python3 production/save-page.py "+p.chapter+" "+p.number+" "+source));
 const py="import json,pathlib\np=pathlib.Path('production/ch"+String(p.chapter).padStart(3,"0")+"-generation-records.json');d=json.loads(p.read_text());x=next(x for x in d['pages'] if x['number']=="+p.number+");x['repairPrompt']="+JSON.stringify(prompt)+";x['visualReview']='checked';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\\n')";
 text(await save("python3 -c "+q(py)));generatedImage(r);notify("第"+p.chapter+"回 "+p.number+"ページの修正を保存");await yield_control();
 }
 store("pendingRepairsDone",true);
}