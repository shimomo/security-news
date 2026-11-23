# 国内セキュリティニュース

国内の情報漏えいなどのセキュリティニュースを、配信元の RSS から集めて一覧表示します。
載せるのは見出しとリンクだけで、記事の内容は各配信元のサイトで読みます。

GitHub Actions が 3 時間ごとに収集し、GitHub Pages で公開します。

## しくみ

1. `.github/workflows/collect.yml` が 3 時間ごと（および `main` への push 時）に動く
2. `src/cli.js` が `sources.json` の RSS を取得し、`site/data/news.json` に蓄積する（直近 90 日分）
3. 記事に増減があったときだけ `site/data/news.json` をコミットする
4. `site/` をそのまま GitHub Pages に公開する

見出しのキーワードから「漏えい・不正アクセス」「脆弱性・注意喚起」「その他」に自動で分類します。
キーワードによる判定なので、誤って分類されることがあります。判定の語は `src/classify.js` にあります。

## 初回の設定

リポジトリの Settings → Pages で、Source を **GitHub Actions** にします。
あとは `main` に push すればワークフローが動き、ページが公開されます。

無料プランで GitHub Pages を使うには、リポジトリを公開 (public) にする必要があります。

## 手元で動かす

Node.js 22 以上が必要です。

```bash
npm ci
npm test          # テスト
npm run collect   # RSS を取得して site/data/news.json を更新
npm run serve     # http://localhost:8000 で表示を確認
```

## 取得元を変える

`sources.json` を編集します。

| 項目 | 内容 |
| --- | --- |
| `id` | 取得元を区別する名前（英数字） |
| `name` | 画面に表示する名前 |
| `site` | 配信元サイトの URL |
| `feed` | RSS 2.0 / RSS 1.0 (RDF) / Atom の URL |
| `category` | 省略可。指定すると、その取得元の記事をすべてこの分類にする（`incident` / `vuln` / `other`） |

## 構成

```
sources.json        取得元の一覧
src/                収集スクリプト（フィードの解析、分類、蓄積）
site/               公開するページ（index.html, app.js, core.js, style.css）
site/data/news.json 集めた見出しとリンク（自動更新）
test/               テスト
```

## ライセンス

国内セキュリティニュースは [MIT license](LICENSE) の下で公開されています。
