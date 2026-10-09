// Dependency-free DOM harness: tests actual reader logic and HTTP paths, not browser layout.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const catalog = JSON.parse(fs.readFileSync(path.join(publicDir, 'data/catalog.json')));

for (const prefix of ['/', '/suiko_manga/', '/renamed-project/']) {
  test(`reader at ${prefix}`, async t => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const filename = path.join(publicDir, pathname.slice(prefix.length));
      if (!filename.startsWith(publicDir + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        res.writeHead(404).end(); return;
      }
      fs.createReadStream(filename).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    const elements = new Map();
    const bodyClasses = new Set();
    const classList = {
      add(...names) { names.forEach(name => bodyClasses.add(name)); },
      remove(...names) { names.forEach(name => bodyClasses.delete(name)); },
      contains(name) { return bodyClasses.has(name); },
      toggle(name, force) { if (force) bodyClasses.add(name); else bodyClasses.delete(name); },
    };
    const el = id => {
      if (!elements.has(id)) elements.set(id, {
        hidden: false, value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
        listeners: {}, attributes: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        scrollIntoView() {}, showModal() {}, close() {},
      });
      return elements.get(id);
    };
    const requests = [], errors = [], pageViews = [];
    const location = {pathname: prefix, search: '', hash: ''};
    const history = {pushState(_a, _b, url) { location.hash = url.startsWith('#') ? url : ''; }};
    history.replaceState = history.pushState;
    let clock = 1000;
    const stored = new Map();
    const context = vm.createContext({
      URL, URLSearchParams, location, history, Image: class {},
      performance: {now: () => clock},
      document: {body: {classList}, currentScript: {src: base + 'app.js'}, getElementById: el,
        querySelectorAll: () => [], querySelector: () => null, addEventListener() {}},
      window: {scrollTo() {}, addEventListener() {}, mangaAnalytics: {
        pageView() { pageViews.push({hash: location.hash, title: context.document.title}); },
      }},
      localStorage: {getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value)},
      IntersectionObserver: class {observe() {} disconnect() {}},
      requestAnimationFrame: f => f(), setTimeout: f => f(),
      console: {error: e => errors.push(e)},
      fetch: async (url, options) => { requests.push(url); const response = await fetch(url, options);
        assert.equal(response.status, 200, url); return response; },
    });
    vm.runInContext(fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8'), context);
    for (let i = 0; !el('collection-status').innerHTML && i < 200; i++) {
      if (errors.length) throw errors[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const ready = catalog.chapters.filter(c => c.pageCount);
    assert.ok(el('collection-status').innerHTML.includes(catalog.totalPages.toLocaleString()));
    assert.equal(pageViews.length, 1);
    assert.equal(pageViews[0].hash, '');
    assert.equal(pageViews[0].title, '水滸伝｜漫画書庫');
    assert.equal(el('toc-list').innerHTML, '', 'Do not build a 120-chapter list on startup');
    assert.equal(requests.length, 1, 'Home fetches only the catalog');
    async function imageLoads(src) {
      assert.ok(src.startsWith(base + 'assets/'), src);
      const response = await fetch(src);
      assert.equal(response.status, 200, src);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
    await imageLoads(el('story-cover').src);
    el('home-toc').onclick();
    assert.equal((el('toc-list').innerHTML.match(/class="toc-item"/g) || []).length, ready.length);
    assert.ok(!el('toc-list').innerHTML.includes('<img'), 'Episode picker has no cover downloads');
    el('toc-search').value = '２５';
    el('toc-search').listeners.input();
    assert.equal((el('toc-list').innerHTML.match(/class="toc-item"/g) || []).length, 1);
    assert.ok(el('toc-list').innerHTML.includes('第25回'));
    el('toc-search').value = '';
    el('toc-sort').onclick();
    assert.ok(el('toc-list').innerHTML.startsWith('<button class="toc-item" data-chapter="25"'));
    // Visit each published chapter, checking first/last page and boundary buttons.
    for (const chapter of ready) {
      const viewCount = pageViews.length;
      await vm.runInContext(`navigate(${chapter.number},1)`, context);
      assert.equal(pageViews.length, viewCount + 1, 'Chapter navigation records one view');
      assert.equal(pageViews.at(-1).hash, `#chapter=${chapter.number}&page=1`);
      assert.equal(pageViews.at(-1).title, `第${chapter.number}回 1頁｜水滸伝`);
      assert.equal(el('previous-page').disabled, chapter.number === ready[0].number);
      await imageLoads(el('page-image').src);
      await el('next-page').onclick();
      assert.equal(Number(el('page-select').value), 2);
      assert.equal(pageViews.at(-1).hash, `#chapter=${chapter.number}&page=2`);
      assert.equal(pageViews.at(-1).title, `第${chapter.number}回 2頁｜水滸伝`);
      await imageLoads(el('page-image').src);
      await el('previous-page').onclick();
      assert.equal(Number(el('page-select').value), 1);
      await vm.runInContext(`navigate(${chapter.number},9999)`, context);
      assert.equal(Number(el('page-select').value), chapter.pageCount);
      assert.equal(el('next-page').disabled, chapter.number === ready.at(-1).number);
      await imageLoads(el('page-image').src);
      if (chapter.number !== ready.at(-1).number) {
        await el('next-page').onclick();
        assert.ok(location.hash.includes(`chapter=${chapter.number + 1}&page=1`));
        await el('previous-page').onclick();
        assert.ok(location.hash.includes(`chapter=${chapter.number}&page=${chapter.pageCount}`));
      }
    }
    const last = ready.at(-1);
    assert.equal(el('next-chapter').disabled, true);
    await el('previous-chapter').onclick();
    assert.ok(location.hash.includes(`chapter=${ready.at(-2).number}`));
    await el('next-chapter').onclick();
    assert.ok(location.hash.includes(`chapter=${last.number}`));
    el('reading-mode').onchange({target: {value: 'scroll'}});
    assert.equal((el('scroll-pages').innerHTML.match(/<figure /g) || []).length, last.pageCount);
    for (const match of el('scroll-pages').innerHTML.matchAll(/<img[^>]+src="([^"]+)"/g)) await imageLoads(match[1]);
    el('zoom-open').onclick(); await imageLoads(el('zoom-image').src);
    el('image-retry').onclick(); await imageLoads(el('page-image').src);
    location.hash = '#chapter=25&page=17';
    vm.runInContext('route()', context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(Number(el('page-select').value), 17);
    vm.runInContext('library()', context);
    assert.equal(el('library').hidden, false);
    assert.equal(el('resume').hidden, false);
    assert.ok(el('resume-detail').textContent.includes('17 / 17'));
    assert.equal(bodyClasses.has('reading'), false);
    await el('resume-button').onclick();
    assert.ok(location.hash.includes('chapter=25&page=17'));
    // A swipe must not also trigger the synthetic edge click that follows it.
    el('reading-mode').onchange({target: {value: 'paged'}});
    await vm.runInContext('navigate(1,1)', context);
    el('page-stage').listeners.touchstart({touches: [{clientX: 100, clientY: 200}]});
    el('page-stage').listeners.touchend({changedTouches: [{clientX: 210, clientY: 202}], cancelable: true, preventDefault() {}});
    assert.equal(Number(el('page-select').value), 2);
    el('tap-next').onclick();
    assert.equal(Number(el('page-select').value), 2);
    clock += 1000;
    await el('tap-next').onclick();
    assert.equal(Number(el('page-select').value), 3);
    assert.equal(JSON.parse(stored.get('water-margin-reading-v1')).page, 3);
    assert.ok(requests.every(url => url.startsWith(base + 'data/')));
    assert.deepEqual(errors, []);
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    for (const file of ['style.css', 'analytics.js', 'app.js']) {
      assert.ok(index.includes(`"./${file}"`));
      assert.equal((await fetch(base + file)).status, 200);
    }
  });
}

test('staging preserves all assets and data; 404 returns home even from nested paths', () => {
  for (const prefix of ['/suiko_manga', '', '/renamed-project']) {
    execFileSync('python3', ['scripts/prepare-pages.py', '--base-path', prefix], {cwd: root});
    const page = fs.readFileSync(path.join(root, '_site/404.html'), 'utf8');
    const home = page.match(/id="home-link" href="([^"]+)"/)[1];
    assert.equal(new URL(home, `https://example.test${prefix}/missing/deep/page`).pathname, prefix + '/');
    for (const folder of ['assets', 'data']) {
      for (const file of fs.readdirSync(path.join(publicDir, folder), {recursive: true})) {
        const source = path.join(publicDir, folder, file);
        if (fs.statSync(source).isFile()) assert.ok(fs.readFileSync(source).equals(fs.readFileSync(path.join(root, '_site', folder, file))), file);
      }
    }
    assert.ok(!fs.existsSync(path.join(root, '_site/README.md')));
    assert.ok(fs.existsSync(path.join(root, '_site/.nojekyll')));
  }
});

function analyticsFixture(hostname = 'kekoyana.github.io', pathname = '/suiko_manga/', gtag) {
  const location = {hostname, pathname, href: `https://${hostname}${pathname}`};
  const tags = [];
  const document = {title: '水滸伝｜漫画書庫', referrer: 'https://example.test/',
    createElement: () => ({}), head: {appendChild: tag => tags.push(tag)}};
  const window = {gtag};
  const context = vm.createContext({window, location, document});
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'analytics.js'), 'utf8'), context);
  return {window, location, document, tags};
}

test('GA4 records final chapter/page URLs, titles and referrers without duplicate views', () => {
  const {window, location, document, tags} = analyticsFixture();
  assert.equal(tags.length, 1);
  assert.equal(tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-7E7653QC6V');
  assert.equal(tags[0].async, true);
  const commands = () => window.dataLayer.map(args => Array.from(args));
  const views = () => commands().filter(args => args[0] === 'event' && args[1] === 'page_view');
  assert.equal(commands().find(args => args[0] === 'config')[2].send_page_view, false);
  assert.equal(views().length, 0);
  window.mangaAnalytics.pageView();
  window.mangaAnalytics.pageView();
  assert.equal(views().length, 1);
  assert.equal(views()[0][2].page_referrer, 'https://example.test/');
  const home = location.href;
  location.href = home + '#chapter=1&page=1';
  document.title = '第1回 1頁｜水滸伝';
  window.mangaAnalytics.pageView();
  assert.equal(views().at(-1)[2].page_location, location.href);
  assert.equal(views().at(-1)[2].page_title, document.title);
  assert.equal(views().at(-1)[2].page_referrer, home);
  const firstPage = location.href;
  location.href = home + '#chapter=1&page=2';
  document.title = '第1回 2頁｜水滸伝';
  window.mangaAnalytics.pageView();
  window.mangaAnalytics.pageView();
  assert.equal(views().length, 3);
  assert.equal(views().at(-1)[2].page_referrer, firstPage);
  assert.equal(views().at(-1)[2].send_to, 'G-7E7653QC6V');
  location.href = home;
  document.title = '水滸伝｜漫画書庫';
  window.mangaAnalytics.pageView();
  assert.equal(views().length, 4, 'Returning home is a new view');
});

test('GA4 excludes local previews and other GitHub Pages projects', () => {
  for (const [hostname, pathname] of [['localhost','/suiko_manga/'],['127.0.0.1','/'],['kekoyana.github.io','/another-project/']]) {
    const {window, tags} = analyticsFixture(hostname, pathname);
    assert.equal(tags.length, 0);
    assert.equal(window.mangaAnalytics, undefined);
    assert.equal(window.dataLayer, undefined);
  }
});

test('A blocked or failing analytics tag does not throw into the reader', () => {
  assert.doesNotThrow(() => analyticsFixture('kekoyana.github.io', '/suiko_manga/', () => {throw Error('blocked');}));
  const {window} = analyticsFixture();
  window.gtag = () => {throw Error('blocked');};
  assert.doesNotThrow(() => window.mangaAnalytics.pageView());
});
