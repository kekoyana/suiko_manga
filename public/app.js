'use strict';
const $=id=>document.getElementById(id);const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='water-margin-reading-v1';let catalog,current,page=1,mode='paged',saved=null,observer=null,routeToken=0,scrollGuard=false;const cache=new Map();
try{saved=JSON.parse(localStorage.getItem(KEY)||'null');mode=localStorage.getItem(KEY+'-mode')==='scroll'?'scroll':'paged'}catch{};
function notify(text){$('live').textContent=text}
function save(){if(!current)return; saved={chapter:current.number,page};try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{$('save-status').textContent='この端末では読書位置を保存できません'} }
function hash(ch,p){return `#chapter=${ch}&page=${p}`}
function setHash(ch,p,replace=false){(replace?history.replaceState:history.pushState).call(history,null,'',ch?hash(ch,p):location.pathname+location.search)}
function statusLabel(c){return c.status==='complete'?'全編公開':c.status==='partial'?'前編公開':'制作予定'}
function readyChapters(){return catalog.chapters.filter(c=>c.pageCount>0)}
function renderLibrary(){
 const full=catalog.chapters.filter(c=>c.status==='complete').length;const partial=catalog.chapters.filter(c=>c.status==='partial').length;
 $('collection-status').innerHTML=`<strong>${full}</strong> 回まで完成${partial?' · 続編を順次追加':''}<br>公開中 ${catalog.totalPages.toLocaleString()} ページ`;
 $('chapter-grid').innerHTML=catalog.chapters.map(c=>`<article class="chapter-card ${c.pageCount?'':'coming'}">${c.pageCount?`<button class="cover-button" data-chapter="${c.number}" aria-label="第${c.number}回 ${esc(c.title)}を読む"><img class="cover" src="${c.cover}" width="360" height="494" loading="lazy" decoding="async" alt="第${c.number}回の冒頭ページ"><span class="cover-number">第${c.number}回</span></button>`:`<div class="coming-cover" aria-hidden="true"><span>第${c.number}回</span><small>制作予定</small></div>`}<h2>${c.pageCount?`<a href="${hash(c.number,1)}">${esc(c.title)}</a>`:esc(c.title)}</h2><div class="chapter-meta"><span class="${c.pageCount?'ready':''}">${statusLabel(c)}</span>${c.pageCount?`<span>${c.pageCount}頁</span>`:''}</div></article>`).join('');
 $('toc-list').innerHTML=catalog.chapters.map(c=>`<button class="toc-item" data-chapter="${c.number}" ${c.pageCount?'':'disabled'}><span>第${c.number}回</span><strong>${esc(c.title)}</strong><small>${c.pageCount?c.pageCount+'頁':'制作予定'}</small></button>`).join('');
 renderResume();
}
function renderResume(){const c=saved&&catalog.chapters.find(c=>c.number===saved.chapter&&c.pageCount);$('resume').hidden=!c;if(c){$('resume-label').textContent=`第${c.number}回 ${c.title}`;$('resume-detail').textContent=`${Math.min(saved.page,c.pageCount)} / ${c.pageCount} ページ`;}}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
function library(){routeToken++;observer?.disconnect();current=null;$('reader').hidden=true;$('library').hidden=false;$('toc-open').hidden=true;$('footer').hidden=false;document.title='水滸伝｜漫画書庫';renderResume();window.scrollTo(0,0)}
async function navigate(ch,p=1,{replace=false,fromRoute=false}={}){
 const meta=catalog.chapters.find(c=>c.number===Number(ch)&&c.pageCount);if(!meta){if(!fromRoute)setHash(null,1);library();return;}
 const token=++routeToken;closeDialogs();$('fatal').hidden=true;
 try{let data=cache.get(meta.number);if(!data){const res=await fetch(meta.manifest);if(!res.ok)throw Error('chapter');data=await res.json();cache.set(meta.number,data)}if(token!==routeToken)return;
 const different=current?.number!==data.number;current=data;page=Math.max(1,Math.min(Number(p)||1,current.pages.length));
 $('library').hidden=true;$('reader').hidden=false;$('toc-open').hidden=false;$('footer').hidden=true;
 $('chapter-number').textContent=`第${current.number}回 · ${current.status==='partial'?'前編公開':'全編公開'}`;$('chapter-title').textContent=current.title;
 $('page-select').innerHTML=current.pages.map(p=>`<option value="${p.number}">${p.number}</option>`).join('');$('page-total').textContent='/ '+current.pages.length;
 const ready=readyChapters();const index=ready.findIndex(c=>c.number===current.number);$('previous-chapter').disabled=index<=0;$('next-chapter').disabled=index===ready.length-1;$('next-chapter').textContent=index===ready.length-1?'続きは制作中':'次の回';
 $('reading-mode').value=mode;showMode(different);renderPage(false);if(!fromRoute)setHash(ch,page,replace);if(mode==='paged')window.scrollTo(0,0);else scrollToPage();
 }catch(error){if(token!==routeToken)return;$('fatal').hidden=false;$('reader').hidden=true;$('library').hidden=true;console.error(error)}
}
function renderPage(updateUrl=true){if(!current)return;
 const p=current.pages[page-1];if(mode==='paged'){$('page-error').hidden=true;$('page-image').src=p.src;$('page-image').alt=`第${current.number}回 ${current.title} ${page}ページ`}
 $('page-select').value=page;$('previous-page').disabled=page===1;$('tap-previous').disabled=page===1;$('next-page').disabled=page===current.pages.length;$('tap-next').disabled=page===current.pages.length;
 document.title=`第${current.number}回 ${page}頁｜水滸伝`;save();if(updateUrl)setHash(current.number,page,true);notify(`第${current.number}回 ${page} / ${current.pages.length} ページ`);
 if(mode==='paged'&&current.pages[page]){const pre=new Image();pre.src=current.pages[page].src}
}
function advance(delta){if(!current)return;const next=page+delta;if(next<1||next>current.pages.length)return;page=next;renderPage();if(mode==='scroll')scrollToPage()}
function showMode(rebuild=false){observer?.disconnect();$('page-stage').hidden=mode==='scroll';$('scroll-pages').hidden=mode!=='scroll';$('reading-hint').textContent=mode==='paged'?'左側で次のページ · 右側で前のページ':'下へスクロールして読めます';
 if(mode==='scroll'){
  if(rebuild||$('scroll-pages').dataset.chapter!==String(current.number)){$('scroll-pages').innerHTML=current.pages.map(p=>`<figure id="scroll-page-${p.number}" data-page="${p.number}"><img src="${p.src}" alt="第${current.number}回 ${p.number}ページ" width="1296" height="1776" loading="lazy" decoding="async"><figcaption>${p.number} / ${current.pages.length}</figcaption></figure>`).join('');$('scroll-pages').dataset.chapter=current.number;}
  observer=new IntersectionObserver(entries=>{if(scrollGuard)return;const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>Math.abs(a.boundingClientRect.top)-Math.abs(b.boundingClientRect.top));if(visible.length){const next=Number(visible[0].target.dataset.page);if(next!==page){page=next;renderPage()}}},{rootMargin:'-15% 0px -55% 0px',threshold:0});document.querySelectorAll('#scroll-pages figure').forEach(f=>observer.observe(f));
 }
}
function scrollToPage(){scrollGuard=true;requestAnimationFrame(()=>{$(`scroll-page-${page}`)?.scrollIntoView({block:'start',behavior:'instant'});setTimeout(()=>scrollGuard=false,350)})}
function openZoom(){if(!current)return;const img=$('zoom-image');img.src=current.pages[page-1].src;img.alt=`第${current.number}回 ${page}ページ`;img.style.width=$('zoom-level').value+'%';$('zoom-dialog').showModal()}
function route(){const params=new URLSearchParams(location.hash.slice(1));const ch=Number(params.get('chapter'));if(ch)navigate(ch,Number(params.get('page'))||1,{fromRoute:true});else library()}
$('home-link').addEventListener('click',e=>{e.preventDefault();setHash(null,1);closeDialogs();library()});
document.addEventListener('click',e=>{const chapter=e.target.closest('[data-chapter]');if(chapter&&!chapter.disabled)navigate(Number(chapter.dataset.chapter));const close=e.target.closest('[data-close]');if(close)$(close.dataset.close).close()});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$('resume-button').onclick=()=>navigate(saved.chapter,saved.page);$('toc-open').onclick=()=>$('toc-dialog').showModal();$('zoom-open').onclick=openZoom;$('zoom-level').onchange=()=>{$('zoom-image').style.width=$('zoom-level').value+'%'};
$('next-page').onclick=$('tap-next').onclick=()=>advance(1);$('previous-page').onclick=$('tap-previous').onclick=()=>advance(-1);
$('page-select').onchange=e=>{page=Number(e.target.value);renderPage();if(mode==='scroll')scrollToPage()};
$('reading-mode').onchange=e=>{mode=e.target.value;try{localStorage.setItem(KEY+'-mode',mode)}catch{}showMode();renderPage();if(mode==='scroll')scrollToPage();else window.scrollTo(0,0)};
$('previous-chapter').onclick=()=>{const list=readyChapters(),i=list.findIndex(c=>c.number===current.number);if(i>0)navigate(list[i-1].number)};$('next-chapter').onclick=()=>{const list=readyChapters(),i=list.findIndex(c=>c.number===current.number);if(i<list.length-1)navigate(list[i+1].number)};
$('page-image').onerror=()=>$('page-error').hidden=false;$('page-image').onload=()=>$('page-error').hidden=true;$('image-retry').onclick=()=>{$('page-image').src=current.pages[page-1].src+'?retry='+Date.now()};
document.addEventListener('keydown',e=>{if(!current||document.querySelector('dialog[open]')||['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowLeft'){e.preventDefault();advance(1)}else if(e.key==='ArrowRight'){e.preventDefault();advance(-1)}});
let touchStart=null;$('page-stage').addEventListener('touchstart',e=>{if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};else touchStart=null},{passive:true});$('page-stage').addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5){advance(dx>0?1:-1)}touchStart=null},{passive:true});
window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
(async()=>{try{const r=await fetch('/data/catalog.json',{cache:'no-cache'});if(!r.ok)throw Error('catalog');catalog=await r.json();renderLibrary();route()}catch(e){$('library').hidden=true;$('fatal').hidden=false;console.error(e)}})();
