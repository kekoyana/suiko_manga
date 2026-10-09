'use strict';

// All published paths work at / and at a GitHub Pages project prefix.
const siteBase = new URL('.', document.currentScript.src);
const siteUrl = path => new URL(path.replace(/^\/+/, ''), siteBase).href;
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'water-margin-reading-v1';
let catalog, current, page = 1, mode = 'paged', saved = null;
let observer, routeToken = 0, scrollGuard = false, scrollSequence = 0;
let pending = false, failedRoute = null, newestFirst = false, lastRoute = null;
let touchStart = null, suppressTapUntil = 0, prefetchedImage = '';
const cache = new Map();
try {
  const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (Number.isInteger(stored?.chapter) && Number.isInteger(stored?.page) && stored.page > 0) saved = stored;
  mode = localStorage.getItem(KEY + '-mode') === 'scroll' ? 'scroll' : 'paged';
} catch {}

function notify(text) { $('live').textContent = text; }
function readyChapters() { return catalog.chapters.filter(c => c.pageCount > 0); }
function adjacentChapter(delta) {
  if (!current) return null;
  const list = readyChapters();
  return list[list.findIndex(c => c.number === current.number) + delta] || null;
}
function hash(ch, p) { return '#chapter=' + ch + '&page=' + p; }
function setHash(ch, p, replace = false) {
  (replace ? history.replaceState : history.pushState).call(history, null, '', ch ? hash(ch, p) : location.pathname + location.search);
  lastRoute = location.hash;
}
function save() {
  if (!current) return;
  saved = {chapter: current.number, page};
  try { localStorage.setItem(KEY, JSON.stringify(saved)); }
  catch { $('save-status').textContent = 'この端末では読書位置を保存できません。'; }
}
function renderLibrary() {
  const list = readyChapters(), first = list[0], latest = list.at(-1);
  $('collection-status').innerHTML = '<strong>' + list.length + '回・' + catalog.totalPages.toLocaleString() + 'ページ</strong> 公開中';
  for (const id of ['start-reading', 'home-toc', 'choose-chapter']) $(id).disabled = !first;
  if (first) {
    $('story-cover').src = siteUrl(first.cover);
    $('story-cover').hidden = false;
  }
  $('latest').hidden = !latest;
  if (latest) {
    $('latest-number').textContent = '最新公開 · 第' + latest.number + '回';
    $('latest-title').textContent = latest.title;
    $('latest-detail').textContent = latest.status === 'partial' ? latest.pageCount + 'ページを公開中 · 続きは制作中' : '全' + latest.pageCount + 'ページ';
  }
  renderResume();
}
function renderResume() {
  const chapter = saved && catalog.chapters.find(c => c.number === saved.chapter && c.pageCount);
  $('resume').hidden = !chapter;
  if (chapter) {
    $('resume-label').textContent = '第' + chapter.number + '回 ' + chapter.title;
    $('resume-detail').textContent = Math.min(saved.page, chapter.pageCount) + ' / ' + chapter.pageCount + 'ページから';
  }
}
function renderToc() {
  const query = $('toc-search').value.trim().normalize('NFKC');
  let list = readyChapters().filter(c => !query || (/^\d+$/.test(query) ? c.number === Number(query) : ('第' + c.number + '回 ' + c.title).includes(query)));
  if (newestFirst) list = list.slice().reverse();
  $('toc-status').textContent = query ? list.length + '回が見つかりました' : '公開中の' + list.length + '回 · 未公開の回は順次追加';
  $('toc-list').innerHTML = list.length ? list.map(c => {
    const active = c.number === (current?.number || saved?.chapter);
    return '<button class="toc-item" data-chapter="' + c.number + '"' + (active ? ' aria-current="true"' : '') + '><span>第' + c.number + '回</span><strong>' + esc(c.title) + '</strong><small>' + (c.status === 'partial' ? '一部公開 · ' : '') + c.pageCount + '頁</small></button>';
  }).join('') : '<p class="toc-empty">該当する回がありません。回数やタイトルを変えてお試しください。</p>';
  $('toc-navigation').hidden = !current;
  $('previous-chapter').disabled = !adjacentChapter(-1);
  $('toc-next').disabled = !adjacentChapter(1);
}
function openToc() {
  if (!catalog) return;
  $('toc-search').value = '';
  renderToc();
  $('toc-dialog').showModal();
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
function setChrome(hidden) {
  document.body.classList.toggle('chrome-hidden', hidden && mode === 'paged');
  $('toggle-chrome').setAttribute('aria-pressed', String(hidden && mode === 'paged'));
  $('toggle-chrome').setAttribute('aria-label', hidden ? '操作バーを表示する' : '操作バーを隠す');
}
function library() {
  routeToken++;
  scrollSequence++;
  pending = false;
  observer?.disconnect();
  closeDialogs();
  current = null;
  document.body.classList.remove('reading', 'reading-paged', 'reading-scroll', 'chrome-hidden');
  $('reader').hidden = true;
  $('library').hidden = false;
  $('fatal').hidden = true;
  $('footer').hidden = false;
  $('reader').removeAttribute('aria-busy');
  document.title = '水滸伝｜漫画書庫';
  renderResume();
  window.scrollTo(0, 0);
  window.mangaAnalytics?.pageView();
}
function goHome() { setHash(null, 1); library(); }
async function loadChapter(meta) {
  if (!cache.has(meta.number)) {
    const promise = (async () => {
      const response = await fetch(siteUrl(meta.manifest));
      if (!response.ok) throw Error('chapter HTTP ' + response.status);
      const data = await response.json();
      if (data.number !== meta.number || !data.pages?.length) throw Error('Invalid chapter');
      return data;
    })();
    cache.set(meta.number, promise);
    promise.catch(() => { if (cache.get(meta.number) === promise) cache.delete(meta.number); });
  }
  return cache.get(meta.number);
}
async function navigate(ch, p = 1, {replace = false, fromRoute = false} = {}) {
  const meta = catalog.chapters.find(c => c.number === Number(ch) && c.pageCount);
  if (!meta) { setHash(null, 1, true); library(); return; }
  const token = ++routeToken;
  observer?.disconnect();
  closeDialogs();
  pending = true;
  $('reader').setAttribute('aria-busy', 'true');
  $('next-page').disabled = $('previous-page').disabled = true;
  $('fatal').hidden = true;
  failedRoute = {ch: meta.number, p};
  try {
    const data = await loadChapter(meta);
    if (token !== routeToken) return;
    const different = current?.number !== data.number;
    current = data;
    page = Math.max(1, Math.min(Math.floor(Number(p)) || 1, current.pages.length));
    pending = false;
    $('library').hidden = true;
    $('reader').hidden = false;
    $('footer').hidden = true;
    $('chapter-number').textContent = '第' + current.number + '回' + (current.status === 'partial' ? ' · 一部公開' : '');
    $('chapter-title').textContent = current.title;
    $('page-select').innerHTML = current.pages.map(p => '<option value="' + p.number + '">' + p.number + '</option>').join('');
    $('page-total').textContent = '/ ' + current.pages.length;
    $('page-range').max = current.pages.length;
    $('reading-mode').value = mode;
    setChrome(false);
    showMode(different);
    renderPage(false);
    // Canonicalize clamped deep links while keeping chapter changes in Back history.
    if (!fromRoute) setHash(current.number, page, replace);
    else if (location.hash !== hash(current.number, page)) setHash(current.number, page, true);
    if (mode === 'paged') window.scrollTo(0, 0);
    else scrollToPage();
    window.mangaAnalytics?.pageView();
  } catch (error) {
    if (token !== routeToken) return;
    pending = false;
    current = null;
    document.body.classList.remove('reading', 'reading-paged', 'reading-scroll', 'chrome-hidden');
    $('fatal').hidden = false;
    $('reader').hidden = $('library').hidden = true;
    $('footer').hidden = false;
    notify('漫画を読み込めませんでした。もう一度お試しください。');
    console.error(error);
  } finally {
    if (token === routeToken) $('reader').removeAttribute('aria-busy');
  }
}
function prefetch(src) {
  const url = siteUrl(src);
  if (url === prefetchedImage) return;
  prefetchedImage = url;
  const image = new Image();
  image.src = url;
}
function renderPage(updateUrl = true) {
  if (!current) return;
  const item = current.pages[page - 1], previous = adjacentChapter(-1), next = adjacentChapter(1);
  const atEnd = page === current.pages.length;
  if (mode === 'paged') {
    const src = siteUrl(item.src);
    if ($('page-image').src !== src) {
      $('page-error').hidden = true;
      $('page-image').src = src;
    }
    $('page-image').alt = '第' + current.number + '回 ' + current.title + ' ' + page + 'ページ';
  }
  $('page-select').value = page;
  $('page-range').value = page;
  $('previous-page').disabled = $('tap-previous').disabled = page === 1 && !previous;
  $('next-page').disabled = $('tap-next').disabled = atEnd && !next;
  const nextLabel = atEnd ? (next ? '次の回へ' : 'ここまで公開') : '次のページ';
  const previousLabel = page === 1 && previous ? '前の回へ' : '前のページ';
  $('next-label').textContent = nextLabel;
  $('previous-label').textContent = previousLabel;
  $('tap-next').setAttribute('aria-label', nextLabel);
  $('tap-previous').setAttribute('aria-label', previousLabel);
  $('previous-chapter').disabled = !previous;
  $('next-chapter').disabled = !next;
  $('next-chapter').hidden = !next;
  $('end-home').hidden = !!next;
  $('chapter-end').hidden = mode === 'paged' && !atEnd;
  $('end-label').textContent = '第' + current.number + '回の' + (current.status === 'partial' ? '公開分はここまで' : '最終ページ');
  $('end-title').textContent = next ? '次は、第' + next.number + '回「' + next.title + '」' : (current.status === 'partial' ? 'この回の続きは制作中です。' : '続きの回は順次公開します。');
  $('next-chapter').innerHTML = next ? '第' + next.number + '回を読む <span aria-hidden="true">←</span>' : '続きは制作中';
  document.title = '第' + current.number + '回 ' + page + '頁｜水滸伝';
  save();
  if (updateUrl) setHash(current.number, page, true);
  if (updateUrl) window.mangaAnalytics?.pageView();
  notify('第' + current.number + '回 ' + page + ' / ' + current.pages.length + 'ページ');
  if (mode === 'paged') {
    if (current.pages[page]) prefetch(current.pages[page].src);
    else if (next) loadChapter(next).then(data => prefetch(data.pages[0].src)).catch(() => {});
  }
}
async function advance(delta) {
  if (!current || pending) return;
  const target = page + delta;
  if (target > current.pages.length) {
    const next = adjacentChapter(1);
    if (next) await navigate(next.number, 1);
  } else if (target < 1) {
    const previous = adjacentChapter(-1);
    if (previous) await navigate(previous.number, previous.pageCount);
  } else {
    page = target;
    renderPage();
    if (mode === 'scroll') scrollToPage();
  }
}
function jumpTo(value) {
  if (!current || pending) return;
  page = Math.max(1, Math.min(Number(value) || 1, current.pages.length));
  renderPage();
  if (mode === 'scroll') scrollToPage();
}
function observeScroll() {
  observer?.disconnect();
  if (!current || mode !== 'scroll') return;
  const height = window.innerHeight || 800;
  observer = new IntersectionObserver(entries => {
    if (scrollGuard || pending || mode !== 'scroll' || !current) return;
    const visible = entries.filter(entry => entry.isIntersecting);
    if (visible.length) {
      const target = Number(visible[0].target.dataset.page);
      if (target !== page) { page = target; renderPage(); }
    }
  }, {rootMargin: '-' + Math.round(height * .38) + 'px 0px -' + Math.round(height * .58) + 'px 0px', threshold: 0});
  document.querySelectorAll('#scroll-pages figure').forEach(figure => observer.observe(figure));
}
function showMode(rebuild = false) {
  observer?.disconnect();
  scrollSequence++;
  scrollGuard = false;
  document.body.classList.add('reading');
  document.body.classList.toggle('reading-paged', mode === 'paged');
  document.body.classList.toggle('reading-scroll', mode === 'scroll');
  $('page-stage').hidden = mode === 'scroll';
  $('scroll-pages').hidden = mode !== 'scroll';
  $('reading-hint').textContent = mode === 'paged' ? '左側をタップ、右へスワイプで次へ · 中央タップで操作バー' : '下へスクロール · 最後から次の回へ';
  if (mode === 'scroll') {
    if (rebuild || $('scroll-pages').dataset.chapter !== String(current.number)) {
      $('scroll-pages').innerHTML = current.pages.map(p => '<figure id="scroll-page-' + p.number + '" data-page="' + p.number + '"><img src="' + esc(siteUrl(p.src)) + '" alt="第' + current.number + '回 ' + p.number + 'ページ" width="' + p.width + '" height="' + p.height + '" loading="lazy" decoding="async"><figcaption>' + p.number + ' / ' + current.pages.length + '</figcaption></figure>').join('');
      $('scroll-pages').dataset.chapter = current.number;
    }
    observeScroll();
  }
}
function scrollToPage() {
  scrollGuard = true;
  const sequence = ++scrollSequence;
  requestAnimationFrame(() => {
    if (sequence !== scrollSequence || mode !== 'scroll') return;
    $('scroll-page-' + page)?.scrollIntoView({block: 'start', behavior: 'instant'});
    setTimeout(() => { if (sequence === scrollSequence) scrollGuard = false; }, 200);
  });
}
function openZoom() {
  if (!current) return;
  $('zoom-image').src = siteUrl(current.pages[page - 1].src);
  $('zoom-image').alt = '第' + current.number + '回 ' + page + 'ページ';
  $('zoom-image').style.width = $('zoom-level').value + '%';
  $('zoom-dialog').showModal();
}
function route() {
  if (!catalog || lastRoute === location.hash) return;
  lastRoute = location.hash;
  const params = new URLSearchParams(location.hash.slice(1));
  const chapter = Number(params.get('chapter'));
  if (chapter) return navigate(chapter, Number(params.get('page')) || 1, {fromRoute: true});
  library();
}
$('home-link').addEventListener('click', e => { e.preventDefault(); goHome(); });
for (const id of ['reader-back', 'end-home', 'fatal-home']) $(id).onclick = goHome;
for (const id of ['home-toc', 'choose-chapter', 'toc-open']) $(id).onclick = openToc;
$('start-reading').onclick = () => navigate(readyChapters()[0].number);
$('latest-reading').onclick = () => navigate(readyChapters().at(-1).number);
$('resume-button').onclick = () => saved && navigate(saved.chapter, saved.page);
$('toc-search').addEventListener('input', renderToc);
$('toc-sort').onclick = () => {
  newestFirst = !newestFirst;
  $('toc-sort').setAttribute('aria-pressed', String(newestFirst));
  $('toc-sort').textContent = newestFirst ? '古い順' : '新しい順';
  renderToc();
};
document.addEventListener('click', e => {
  const chapter = e.target.closest('[data-chapter]');
  if (chapter && !chapter.disabled) navigate(Number(chapter.dataset.chapter));
  const close = e.target.closest('[data-close]');
  if (close) $(close.dataset.close).close();
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {
  if (e.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close();
  }
}));
$('next-page').onclick = () => advance(1);
$('previous-page').onclick = () => advance(-1);
$('tap-next').onclick = () => { if (performance.now() >= suppressTapUntil) return advance(1); };
$('tap-previous').onclick = () => { if (performance.now() >= suppressTapUntil) return advance(-1); };
$('page-select').onchange = e => jumpTo(e.target.value);
$('page-range').oninput = e => { $('page-select').value = e.target.value; };
$('page-range').onchange = e => jumpTo(e.target.value);
$('toggle-chrome').onclick = () => {
  if (performance.now() >= suppressTapUntil) setChrome(!document.body.classList.contains('chrome-hidden'));
};
$('reading-mode').onchange = e => {
  mode = e.target.value;
  try { localStorage.setItem(KEY + '-mode', mode); } catch {}
  setChrome(false);
  showMode();
  renderPage();
  if (mode === 'scroll') scrollToPage();
  else window.scrollTo(0, 0);
};
$('previous-chapter').onclick = () => { const chapter = adjacentChapter(-1); if (chapter) return navigate(chapter.number); };
$('next-chapter').onclick = $('toc-next').onclick = () => { const chapter = adjacentChapter(1); if (chapter) return navigate(chapter.number); };
$('zoom-open').onclick = openZoom;
$('zoom-level').onchange = () => { $('zoom-image').style.width = $('zoom-level').value + '%'; };
$('page-image').onerror = () => { if (current && mode === 'paged') $('page-error').hidden = false; };
$('page-image').onload = () => { $('page-error').hidden = true; };
$('image-retry').onclick = () => { if (current) $('page-image').src = siteUrl(current.pages[page - 1].src) + '?retry=' + Date.now(); };
$('fatal-retry').onclick = () => failedRoute ? navigate(failedRoute.ch, failedRoute.p) : location.reload();
document.addEventListener('keydown', e => {
  if (!current || document.querySelector('dialog[open]') || ['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    advance(e.key === 'ArrowLeft' ? 1 : -1);
  } else if (e.key === 'Escape') setChrome(false);
});
$('page-stage').addEventListener('touchstart', e => {
  touchStart = e.touches.length === 1 ? {x: e.touches[0].clientX, y: e.touches[0].clientY} : null;
}, {passive: true});
$('page-stage').addEventListener('touchmove', e => { if (e.touches.length !== 1) touchStart = null; }, {passive: true});
$('page-stage').addEventListener('touchcancel', () => { touchStart = null; }, {passive: true});
$('page-stage').addEventListener('touchend', e => {
  if (!touchStart || !e.changedTouches.length) return;
  const dx = e.changedTouches[0].clientX - touchStart.x, dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    suppressTapUntil = performance.now() + 600;
    if (e.cancelable) e.preventDefault();
    advance(dx > 0 ? 1 : -1);
  }
  touchStart = null;
}, {passive: false});
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
window.addEventListener('resize', () => { if (mode === 'scroll') observeScroll(); });
(async () => {
  try {
    const response = await fetch(siteUrl('data/catalog.json'), {cache: 'no-cache'});
    if (!response.ok) throw Error('catalog HTTP ' + response.status);
    catalog = await response.json();
    renderLibrary();
    route();
  } catch (error) {
    $('library').hidden = true;
    $('fatal').hidden = false;
    console.error(error);
  }
})();
