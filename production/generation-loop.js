async function(startChapter=27,startPage=1){
const root=load("root"), save=eval("("+load("saveCode")+")");
for(const c of [27,28,29,30]){
 if(c<startChapter)continue;
 const result=await tools.exec_command({cmd:"cat production/ch0"+c+"-pages.json",workdir:root,max_output_tokens:40000});
 if(result.exit_code!==0)throw new Error(result.output);
 const plan=JSON.parse(result.output);
 for(const p of plan.pages){
 if(c===startChapter&&p.number<startPage)continue;
 const r=await tools.image_gen__imagegen({prompt:p.prompt,referenced_image_paths:p.referencePaths.map(x=>root+"/"+x),transparent_background:false});
 const source=r.output_hint.match(/as (\/[^\s]+\.png) by default/)[1];
 store("generated_"+c+"_"+p.number,{source,prompt:p.prompt});
 text(await save("python3 production/save-page.py "+c+" "+p.number+" "+source));
 generatedImage(r);notify("第"+c+"回 "+p.number+"/"+plan.pages.length+"ページを生成・保存");await yield_control();
 }
}
store("futureImagesDone",true);
}