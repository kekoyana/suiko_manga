# 水滸伝 漫画書庫

静的な画像版漫画リーダーです。第1〜24回の完成済み900ページと、第25回の1〜17ページを合わせた917ページを収録しています。第25回は一部公開で、全51ページを予定しています。続きは制作中です。百二十回本の全120回を順次制作・追加します。第26〜120回は準備中です。

## 読み方

- トップは作品のあらすじ、最初から読むボタン、読書位置からの再開、最新公開の案内です。画像は第1回の表紙1枚のみで、全120回のカードを並べません。
- 「回を選ぶ」「目次」から公開済みの回を選べます。回数・タイトルによる検索と並び順の変更に対応し、目次では表紙画像を読み込みません。
- 横読みは漫画全体と操作バーが画面内に収まります。左側のタップ、右方向へのスワイプ、左矢印キー、下部の「次のページ」で進みます。逆方向の操作で戻ります。
- 最終ページでは同じ操作で次の公開回へ進めます。各回の最初のページから戻ると、前の回の最終ページへ移動します。最後の公開ページでは「続きは制作中」と表示します。
- 下部のページ番号・スライダーからページを指定できます。中央タップで操作バーを隠して読め、もう一度タップ、または Escape キーで戻せます。
- 縦読み・拡大にも対応します。読書位置と読み方は従来と同じ localStorage のキーで保存します。画像と目録の原本は変更しません。

導線の参考: [コミックDAYSの「1話から」](https://comic-days.com/series)、[Renta!のビューアー操作](https://renta.papy.co.jp/renta/sc/frm/page/help/help_viewer.htm)。

## GitHub Pages で公開する

1. この変更を `main` にマージします。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します（リポジトリの管理権限が必要です）。
3. **Actions → Deploy to GitHub Pages → Run workflow** で `main` を実行します。設定後は `main` への push でも自動公開されます。
4. ワークフローの `validate` と `deploy` が成功し、環境 `github-pages` に表示されるURLを開けることを確認します。環境に承認ルールがある場合は承認してください。

標準の公開URL: <https://kekoyana.github.io/suiko_manga/>

第25回17ページへのリンク: <https://kekoyana.github.io/suiko_manga/#chapter=25&page=17>

`deploy` が Pages 未設定のエラーで失敗した場合は、手順2の設定を確認して再実行してください。ワークフローはリポジトリの Pages 設定を自動変更しません。

### 公開ディレクトリとパス

- 公開用の原本は **`public/`** のみです。PDF、README、テスト、スクリプトは公開しません。
- `scripts/prepare-pages.py` が `public/` を `_site/` にコピーし、**`_site/` だけ**を Pages artifact としてアップロードします。
- コピー時に変更するのは404画面の戻り先だけです。`.nojekyll` も追加します。WebP画像とJSONは再圧縮・再生成・移動せず、そのままコピーします。
- CSSとJavaScriptは相対パスで読み込みます。目録、章マニフェスト、表紙、本文、先読み、縦読み、拡大、再読み込みのURLは `app.js` の配置先を基準に解決します。既存JSONの `/assets/...` と `/data/...` は変更不要です。
- 404画面の戻り先には `actions/configure-pages` が返す `base_path` を使います。`/suiko_manga/missing/deep/page` のような深いURLでも書庫トップへ戻れます。ルート公開・カスタムドメインにも対応します。
- `public/_headers` は Cloudflare 専用です。GitHub Pages はこのファイルのキャッシュ設定・HTTPヘッダー設定を適用しません。
- PRでは検証のみを実行し、公開は `main` の push または手動実行に限定します。検証成功後に、`pages: write` と `id-token: write` を持つ公開ジョブを実行します。

## ローカル検証

Python 3.9以降と Node.js 22以降を使用します。追加のnpmパッケージは不要です。

```sh
python3 scripts/validate-public.py
node --check public/app.js
node --test tests/reader.test.cjs
```

検証内容:

- 全章のページ数、連番、目録から参照する全JSON・WebPの存在とWebPヘッダー。
- `/`、`/suiko_manga/`、別名プロジェクトの3種類で、トップの読み込み範囲、目次の検索・並び順、全公開回の先頭・2ページ目・末尾、ページ操作での前後の回への移動、最終公開ページの境界。
- 読書位置の保存・再開、スワイプ後の合成クリックによる二重ページ送りの防止。
- 表紙と上記本文画像のHTTP取得、縦読み・拡大・再読み込みの画像URL、ハッシュでの第25回17ページ指定。
- 公開前後の全画像・JSONのバイト一致、404の深いURLからの戻り先、公開範囲。

Nodeのテストは簡易DOMとローカルHTTPサーバーによるロジック検証です。実ブラウザーのレイアウト、画像デコード、タッチ操作、IntersectionObserverの挙動を検証するものではありません。

### プロジェクトURLを再現してブラウザーで確認

```sh
python3 scripts/prepare-pages.py --base-path /suiko_manga
mkdir -p /tmp/suiko-pages-preview
ln -sfn "$PWD/_site" /tmp/suiko-pages-preview/suiko_manga
python3 -m http.server 8000 --directory /tmp/suiko-pages-preview
```

<http://localhost:8000/suiko_manga/> を開き、紹介ページ・目次・画像表示・ページ送り・回をまたぐ移動・縦読み・拡大・再読込を確認します。ルート公開の場合は `--base-path ''` とし、`python3 -m http.server 8000 --directory _site` で起動してください。

標準のPythonサーバーは404応答に独自の `404.html` を使いません。深いURLでの404画面と戻り先は、GitHub Pagesへの公開後にも確認してください。

## Cloudflare Pages を使う場合

- リポジトリ: `kekoyana/suiko_manga`
- 本番ブランチ: `main`
- フレームワーク: なし
- ビルドコマンド: `python3 scripts/prepare-pages.py`
- ビルド出力ディレクトリ: `_site`

ルート公開を想定します。こちらも `public/` の画像・JSONをそのままコピーし、404画面の戻り先を `/` に設定します。
