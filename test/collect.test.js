import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, serialize } from '../src/collect.js';

const now = new Date('2026-11-16T12:00:00.000Z');

const rss = (items) =>
  `<rss version="2.0"><channel>${items
    .map(
      ([title, link, pubDate]) =>
        `<item><title>${title}</title><link>${link}</link><pubDate>${pubDate}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

const newsSource = { id: 'news', name: 'Example News', site: 'https://news.example/', feed: 'https://news.example/feed' };
const alertSource = {
  id: 'alert',
  name: 'Example CERT',
  site: 'https://cert.example/',
  feed: 'https://cert.example/rss',
  category: 'vuln',
};

// ネットワークの代わりに、URL ごとに決めた内容を返す
const fakeFetch = (responses) => async (url) => {
  const response = responses[url];
  if (response instanceof Error) throw response;
  if (response === undefined) throw new Error(`想定外の URL: ${url}`);
  return response;
};

test('取得元ごとの記事に、取得元の ID と見出しから決めた分類を付ける', async () => {
  const result = await collect({
    sources: [newsSource],
    existing: [],
    now,
    retentionDays: 90,
    fetchText: fakeFetch({
      'https://news.example/feed': rss([
        ['A社に不正アクセス', 'https://news.example/1', 'Mon, 16 Nov 2026 10:00:00 +0000'],
        ['製品Bに脆弱性', 'https://news.example/2', 'Mon, 16 Nov 2026 09:00:00 +0000'],
        ['先週注目された記事', 'https://news.example/3', 'Mon, 16 Nov 2026 08:00:00 +0000'],
      ]),
    }),
  });

  assert.deepEqual(
    result.items.map((item) => [item.url, item.source, item.category]),
    [
      ['https://news.example/1', 'news', 'incident'],
      ['https://news.example/2', 'news', 'vuln'],
      ['https://news.example/3', 'news', 'other'],
    ],
  );
  assert.equal(result.added, 3);
});

test('分類を固定した取得元の記事は、見出しに関わらずその分類にする', async () => {
  const result = await collect({
    sources: [alertSource],
    existing: [],
    now,
    retentionDays: 90,
    fetchText: fakeFetch({
      'https://cert.example/rss': rss([
        ['相次ぐ不正アクセスを踏まえた対策について', 'https://cert.example/1', 'Mon, 16 Nov 2026 10:00:00 +0000'],
      ]),
    }),
  });

  assert.equal(result.items[0].category, 'vuln');
});

test('一部の取得元が失敗しても、残りの取得元の記事は集め、失敗は取得元ごとに記録する', async () => {
  const result = await collect({
    sources: [newsSource, alertSource],
    existing: [],
    now,
    retentionDays: 90,
    fetchText: fakeFetch({
      'https://news.example/feed': new Error('HTTP 503'),
      'https://cert.example/rss': rss([
        ['注意喚起: 製品Cの脆弱性', 'https://cert.example/1', 'Mon, 16 Nov 2026 10:00:00 +0000'],
      ]),
    }),
  });

  assert.deepEqual(
    result.items.map((item) => item.url),
    ['https://cert.example/1'],
  );
  assert.deepEqual(result.sources, [
    { id: 'news', name: 'Example News', site: 'https://news.example/', ok: false, error: 'HTTP 503' },
    { id: 'alert', name: 'Example CERT', site: 'https://cert.example/', ok: true },
  ]);
});

test('フィードとして読めない応答が返った取得元は失敗として記録する', async () => {
  const result = await collect({
    sources: [newsSource, alertSource],
    existing: [],
    now,
    retentionDays: 90,
    fetchText: fakeFetch({
      'https://news.example/feed': '<html><body>メンテナンス中</body></html>',
      'https://cert.example/rss': rss([]),
    }),
  });

  assert.equal(result.sources[0].ok, false);
  assert.match(result.sources[0].error, /フィード/);
  assert.equal(result.sources[1].ok, true);
});

test('取得に失敗した取得元の保存済み記事は消さない', async () => {
  const kept = {
    title: '以前に集めた記事',
    url: 'https://news.example/old',
    source: 'news',
    category: 'incident',
    publishedAt: '2026-11-10T00:00:00.000Z',
    firstSeenAt: '2026-11-10T03:00:00.000Z',
  };

  const result = await collect({
    sources: [newsSource, alertSource],
    existing: [kept],
    now,
    retentionDays: 90,
    fetchText: fakeFetch({
      'https://news.example/feed': new Error('timeout'),
      'https://cert.example/rss': rss([]),
    }),
  });

  assert.deepEqual(result.items, [kept]);
  assert.equal(result.changed, false);
});

test('すべての取得元で失敗したときはエラーにして、保存済みデータを上書きさせない', async () => {
  await assert.rejects(
    collect({
      sources: [newsSource, alertSource],
      existing: [],
      now,
      retentionDays: 90,
      fetchText: fakeFetch({
        'https://news.example/feed': new Error('HTTP 500'),
        'https://cert.example/rss': new Error('HTTP 500'),
      }),
    }),
    /すべての取得元/,
  );
});

test('serialize の出力は JSON として読み戻せて、記事 1 件が 1 行になる', () => {
  const data = {
    updatedAt: '2026-11-16T12:00:00.000Z',
    sources: [{ id: 'news', name: 'Example "News"', site: 'https://news.example/', ok: true }],
    items: [
      {
        title: '改行\nと "引用符" を含む見出し',
        url: 'https://news.example/1',
        source: 'news',
        category: 'incident',
        publishedAt: '2026-11-16T10:00:00.000Z',
        firstSeenAt: '2026-11-16T12:00:00.000Z',
      },
      {
        title: '2 件目',
        url: 'https://news.example/2',
        source: 'news',
        category: 'other',
        publishedAt: '2026-11-16T09:00:00.000Z',
        firstSeenAt: '2026-11-16T12:00:00.000Z',
      },
    ],
  };

  const text = serialize(data);

  assert.deepEqual(JSON.parse(text), data);
  const itemLines = text.split('\n').filter((line) => line.includes('"url"'));
  assert.equal(itemLines.length, 2);
  assert.ok(text.endsWith('\n'));
});

test('serialize は記事が 0 件でも JSON として読み戻せる', () => {
  const data = { updatedAt: '2026-11-16T12:00:00.000Z', sources: [], items: [] };

  assert.deepEqual(JSON.parse(serialize(data)), data);
});
