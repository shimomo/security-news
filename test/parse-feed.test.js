import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/parse-feed.js';

test('RSS 2.0 の item から見出し・リンク・公開日時を取り出す', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Example</title>
<item>
  <title>A社で個人情報が流出</title>
  <link>https://example.com/news/1</link>
  <pubDate>Mon, 16 Nov 2026 12:42:48 +0900</pubDate>
  <description>本文の要約は保存しない</description>
</item>
<item>
  <title>B社に不正アクセス</title>
  <link>https://example.com/news/2</link>
  <pubDate>Mon, 16 Nov 2026 01:45:49 +0000</pubDate>
</item>
</channel></rss>`;

  assert.deepEqual(parseFeed(xml), [
    { title: 'A社で個人情報が流出', url: 'https://example.com/news/1', publishedAt: '2026-11-16T03:42:48.000Z' },
    { title: 'B社に不正アクセス', url: 'https://example.com/news/2', publishedAt: '2026-11-16T01:45:49.000Z' },
  ]);
});

test('RSS 1.0 (RDF) の item は dc:date を公開日時として読む', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://example.org/"><title>Example</title></channel>
<item rdf:about="https://example.org/at/1.html">
  <title>注意喚起: 製品Xの脆弱性</title>
  <link>https://example.org/at/1.html</link>
  <dc:date>2026-11-11T11:20+09:00</dc:date>
</item>
<item rdf:about="https://example.org/at/2.html">
  <title>注意喚起: 製品Yの脆弱性</title>
  <link>https://example.org/at/2.html</link>
  <dc:date>2026-11-15T23:25:02Z</dc:date>
</item>
</rdf:RDF>`;

  assert.deepEqual(parseFeed(xml), [
    { title: '注意喚起: 製品Xの脆弱性', url: 'https://example.org/at/1.html', publishedAt: '2026-11-11T02:20:00.000Z' },
    { title: '注意喚起: 製品Yの脆弱性', url: 'https://example.org/at/2.html', publishedAt: '2026-11-15T23:25:02.000Z' },
  ]);
});

test('Atom の entry は記事ページへのリンクを選び、添付 (enclosure) のリンクは使わない', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
<title>Example blog</title>
<link href="https://blog.example.jp/"/>
<entry>
  <title>障害についてまとめてみた</title>
  <link rel="enclosure" href="https://img.example.jp/og.png" type="image/png" length="0" />
  <link href="https://blog.example.jp/entry/1"/>
  <published>2026-11-16T15:07:45+09:00</published>
  <updated>2026-11-16T18:00:00+09:00</updated>
  <content type="html">&lt;p&gt;本文&lt;/p&gt;</content>
</entry>
</feed>`;

  assert.deepEqual(parseFeed(xml), [
    { title: '障害についてまとめてみた', url: 'https://blog.example.jp/entry/1', publishedAt: '2026-11-16T06:07:45.000Z' },
  ]);
});

test('Atom で published が無いときは updated を公開日時にする', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>更新日時のみ</title>
  <link rel="alternate" href="https://blog.example.jp/entry/2"/>
  <updated>2026-11-10T00:00:00Z</updated>
</entry>
</feed>`;

  assert.deepEqual(parseFeed(xml), [
    { title: '更新日時のみ', url: 'https://blog.example.jp/entry/2', publishedAt: '2026-11-10T00:00:00.000Z' },
  ]);
});

test('見出しの CDATA と文字参照を通常の文字に戻す', () => {
  const xml = `<rss version="2.0"><channel>
<item><title><![CDATA[C社 <重要> のお知らせ]]></title><link>https://example.com/a</link></item>
<item><title>D社 &amp; E社 &#8211; 共同発表 &#x3042;</title><link>https://example.com/b</link></item>
</channel></rss>`;

  assert.deepEqual(
    parseFeed(xml).map((item) => item.title),
    ['C社 <重要> のお知らせ', 'D社 & E社 – 共同発表 あ'],
  );
});

test('見出しの改行や連続する半角空白は 1 つの空白にまとめ、全角空白は元のまま残す', () => {
  const xml = `<rss version="2.0"><channel>
<item><title>
   F社で
   誤送信　発生
</title><link>https://example.com/c</link></item>
</channel></rss>`;

  assert.equal(parseFeed(xml)[0].title, 'F社で 誤送信　発生');
});

test('item が 1 件だけのフィードでも配列で返す', () => {
  const xml = `<rss version="2.0"><channel>
<item><title>1件だけ</title><link>https://example.com/only</link></item>
</channel></rss>`;

  assert.equal(parseFeed(xml).length, 1);
});

test('公開日時が無い・解釈できない item は publishedAt を null にする', () => {
  const xml = `<rss version="2.0"><channel>
<item><title>日時なし</title><link>https://example.com/d</link></item>
<item><title>日時が壊れている</title><link>https://example.com/e</link><pubDate>きのう</pubDate></item>
</channel></rss>`;

  assert.deepEqual(
    parseFeed(xml).map((item) => item.publishedAt),
    [null, null],
  );
});

test('http(s) 以外のリンクや、見出し・リンクが欠けた item は捨てる', () => {
  const xml = `<rss version="2.0"><channel>
<item><title>危険なリンク</title><link>javascript:alert(1)</link></item>
<item><title>リンクなし</title></item>
<item><title></title><link>https://example.com/no-title</link></item>
<item><title>正常</title><link>  https://example.com/ok  </link></item>
</channel></rss>`;

  assert.deepEqual(parseFeed(xml), [
    { title: '正常', url: 'https://example.com/ok', publishedAt: null },
  ]);
});

test('数字だけの見出しも文字列として扱う', () => {
  const xml = `<rss version="2.0"><channel>
<item><title>2026</title><link>https://example.com/year</link></item>
</channel></rss>`;

  assert.equal(parseFeed(xml)[0].title, '2026');
});

test('フィードとして読めない内容はエラーにする', () => {
  assert.throws(() => parseFeed('<html><body>メンテナンス中</body></html>'), /フィード/);
  assert.throws(() => parseFeed(''), /フィード/);
});

test('記事が 0 件のフィードは空配列を返す', () => {
  assert.deepEqual(parseFeed('<rss version="2.0"><channel><title>空</title></channel></rss>'), []);
});
