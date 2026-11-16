import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeItems } from '../src/merge.js';

const now = new Date('2026-11-16T12:00:00.000Z');
const options = { now, retentionDays: 90 };

const stored = (overrides = {}) => ({
  title: '保存済みの記事',
  url: 'https://example.com/stored',
  source: 'example',
  category: 'incident',
  publishedAt: '2026-11-15T03:00:00.000Z',
  firstSeenAt: '2026-11-15T06:00:00.000Z',
  ...overrides,
});

const fetched = (overrides = {}) => ({
  title: '新しい記事',
  url: 'https://example.com/new',
  source: 'example',
  category: 'vuln',
  publishedAt: '2026-11-16T09:00:00.000Z',
  ...overrides,
});

test('初めて見る記事は、取得した時刻を firstSeenAt に記録して追加する', () => {
  const result = mergeItems([], [fetched()], options);

  assert.deepEqual(result.items, [
    {
      title: '新しい記事',
      url: 'https://example.com/new',
      source: 'example',
      category: 'vuln',
      publishedAt: '2026-11-16T09:00:00.000Z',
      firstSeenAt: '2026-11-16T12:00:00.000Z',
    },
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.changed, true);
});

test('保存済みの記事を再び取得しても重複させず、firstSeenAt と公開日時は元のまま保つ', () => {
  const again = fetched({
    title: '保存済みの記事',
    url: 'https://example.com/stored',
    category: 'incident',
    publishedAt: '2026-11-16T11:00:00.000Z',
  });

  const result = mergeItems([stored()], [again], options);

  assert.deepEqual(result.items, [stored()]);
  assert.equal(result.added, 0);
  assert.equal(result.changed, false);
});

test('保存済みの記事の見出しが配信元で直されたら、見出しと分類を新しい内容にする', () => {
  const corrected = fetched({
    title: '保存済みの記事（訂正）',
    url: 'https://example.com/stored',
    category: 'vuln',
  });

  const result = mergeItems([stored()], [corrected], options);

  assert.deepEqual(result.items, [stored({ title: '保存済みの記事（訂正）', category: 'vuln' })]);
  assert.equal(result.added, 0);
  assert.equal(result.changed, true);
});

test('公開日時の新しい順に並べる', () => {
  const result = mergeItems(
    [stored({ url: 'https://example.com/b', publishedAt: '2026-11-14T00:00:00.000Z' })],
    [
      fetched({ url: 'https://example.com/a', publishedAt: '2026-11-13T00:00:00.000Z' }),
      fetched({ url: 'https://example.com/c', publishedAt: '2026-11-15T00:00:00.000Z' }),
    ],
    options,
  );

  assert.deepEqual(
    result.items.map((item) => item.url),
    ['https://example.com/c', 'https://example.com/b', 'https://example.com/a'],
  );
});

test('保持期間より古い記事は、保存済みでも新規でも残さない', () => {
  const result = mergeItems(
    [
      stored({ url: 'https://example.com/old-stored', publishedAt: '2026-08-18T11:59:59.000Z' }),
      stored({ url: 'https://example.com/edge-stored', publishedAt: '2026-08-18T12:00:00.000Z' }),
    ],
    [fetched({ url: 'https://example.com/old-new', publishedAt: '2026-07-01T00:00:00.000Z' })],
    options,
  );

  assert.deepEqual(
    result.items.map((item) => item.url),
    ['https://example.com/edge-stored'],
  );
  assert.equal(result.added, 0);
  assert.equal(result.changed, true);
});

test('公開日時が分からない記事は、取得した時刻を公開日時として扱う', () => {
  const result = mergeItems([], [fetched({ publishedAt: null })], options);

  assert.equal(result.items[0].publishedAt, '2026-11-16T12:00:00.000Z');
});

test('公開日時が未来になっている記事は、取得した時刻に直して先頭に居座らせない', () => {
  const result = mergeItems([], [fetched({ publishedAt: '2027-01-01T00:00:00.000Z' })], options);

  assert.equal(result.items[0].publishedAt, '2026-11-16T12:00:00.000Z');
});

test('同じ URL が同じ回に複数届いても 1 件にする', () => {
  const result = mergeItems(
    [],
    [fetched({ title: '先に届いた見出し' }), fetched({ title: '後から届いた見出し' })],
    options,
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, '先に届いた見出し');
  assert.equal(result.added, 1);
});

test('渡された配列や記事を書き換えない', () => {
  const existing = [stored()];
  const snapshot = structuredClone(existing);

  mergeItems(existing, [fetched({ title: '訂正', url: 'https://example.com/stored' }), fetched()], options);

  assert.deepEqual(existing, snapshot);
});
