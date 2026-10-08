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
    const el = id => {
      if (!elements.has(id)) elements.set(id, {
        hidden: false, value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
        addEventListener() {}, scrollIntoView() {}, showModal() {}, close() {},
      });
      return elements.get(id);
    };
    const requests = [], errors = [];
    const location = {pathname: prefix, search: '', hash: ''};
    const history = {pushState(_a, _b, url) { location.hash = url.startsWith('#') ? url : ''; }};
    history.replaceState = history.pushState;
    const context = vm.createContext({
      URL, URLSearchParams, location, history, Image: class {},
      document: {currentScript: {src: base + 'app.js'}, getElementById: el,
        querySelectorAll: () => [], querySelector: () => null, addEventListener() {}},
      window: {scrollTo() {}, addEventListener() {}},
      localStorage: {getItem: () => null, setItem() {}},
      IntersectionObserver: class {observe() {} disconnect() {}},
      requestAnimationFrame: f => f(), setTimeout: f => f(),
      console: {error: e => errors.push(e)},
      fetch: async (url, options) => { requests.push(url); const response = await fetch(url, options);
        assert.equal(response.status, 200, url); return response; },
    });
    vm.runInContext(fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8'), context);
    for (let i = 0; !el('chapter-grid').innerHTML && i < 200; i++) {
      if (errors.length) throw errors[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const ready = catalog.chapters.filter(c => c.pageCount);
    assert.equal((el('chapter-grid').innerHTML.match(/<article /g) || []).length, catalog.chapters.length);
    assert.equal((el('chapter-grid').innerHTML.match(/class="cover"/g) || []).length, ready.length);
    assert.ok(el('collection-status').innerHTML.includes(catalog.totalPages.toLocaleString()));
    async function imageLoads(src) {
      assert.ok(src.startsWith(base + 'assets/'), src);
      const response = await fetch(src);
      assert.equal(response.status, 200, src);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
    for (const match of el('chapter-grid').innerHTML.matchAll(/<img[^>]+src="([^"]+)"/g)) await imageLoads(match[1]);
    // Visit each published chapter, checking first/last page and boundary buttons.
    for (const chapter of ready) {
      await vm.runInContext(`navigate(${chapter.number},1)`, context);
      assert.equal(el('previous-page').disabled, true);
      await imageLoads(el('page-image').src);
      el('next-page').onclick();
      assert.equal(Number(el('page-select').value), 2);
      await imageLoads(el('page-image').src);
      el('previous-page').onclick();
      assert.equal(Number(el('page-select').value), 1);
      await vm.runInContext(`navigate(${chapter.number},9999)`, context);
      assert.equal(Number(el('page-select').value), chapter.pageCount);
      assert.equal(el('next-page').disabled, true);
      await imageLoads(el('page-image').src);
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
    assert.ok(requests.every(url => url.startsWith(base + 'data/')));
    assert.deepEqual(errors, []);
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    for (const file of ['style.css', 'app.js']) {
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
