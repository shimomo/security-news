import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterItems,
  formatDateTime,
  formatTime,
  groupByDay,
  isNew,
  isStale,
  nextVisitState,
} from '../site/core.js';

const item = (overrides = {}) => ({
  title: 'A社に不正アクセス',
  url: 'https://example.com/1',
  source: 'news',
  category: 'incident',
  publishedAt: '2026-11-16T03:00:00.000Z',
  firstSeenAt: '2026-11-16T06:00:00.000Z',
  ...overrides,
});

const urls = (items) => items.map((entry) => entry.url);

const mixed = [
  item({ url: 'https://example.com/1', title: 'A社に不正アクセス', category: 'incident', source: 'news' }),
  item({ url: 'https://example.com/2', title: 'VPN製品Bに脆弱性', category: 'vuln', source: 'news' }),
  item({ url: 'https://example.com/3', title: '注意喚起: ＶＰＮ製品Cの脆弱性', category: 'vuln', source: 'cert' }),
  item({ url: 'https://example.com/4', title: '先週注目された記事', category: 'other', source: 'news' }),
];

const noFilter = { category: 'all', source: 'all', query: '' };

test('絞り込みを指定しなければ全件を元の順で返す', () => {
  assert.deepEqual(urls(filterItems(mixed, noFilter)), [
    'https://example.com/1',
    'https://example.com/2',
    'https://example.com/3',
    'https://example.com/4',
  ]);
});

test('分類で絞り込む', () => {
  assert.deepEqual(urls(filterItems(mixed, { ...noFilter, category: 'vuln' })), [
    'https://example.com/2',
    'https://example.com/3',
  ]);
});

test('取得元で絞り込む', () => {
  assert.deepEqual(urls(filterItems(mixed, { ...noFilter, source: 'cert' })), ['https://example.com/3']);
});

test('キーワードは大文字小文字と全角半角を区別せずに見出しを探す', () => {
  assert.deepEqual(urls(filterItems(mixed, { ...noFilter, query: 'vpn' })), [
    'https://example.com/2',
    'https://example.com/3',
  ]);
});

test('空白で区切った複数のキーワードは、すべてを含む見出しだけを返す', () => {
  assert.deepEqual(urls(filterItems(mixed, { ...noFilter, query: ' VPN　注意喚起 ' })), ['https://example.com/3']);
});

test('分類・取得元・キーワードは同時に効く', () => {
  assert.deepEqual(urls(filterItems(mixed, { category: 'vuln', source: 'news', query: '脆弱性' })), [
    'https://example.com/2',
  ]);
});

test('日本時間の日付ごとにまとめ、UTC では前日でも日本時間の日付に入れる', () => {
  const groups = groupByDay([
    item({ url: 'https://example.com/a', publishedAt: '2026-11-16T03:00:00.000Z' }),
    item({ url: 'https://example.com/b', publishedAt: '2026-11-15T15:00:00.000Z' }),
    item({ url: 'https://example.com/c', publishedAt: '2026-11-15T14:59:59.000Z' }),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.day, group.label, urls(group.items)]),
    [
      ['2026-11-16', '11月16日（月）', ['https://example.com/a', 'https://example.com/b']],
      ['2026-11-15', '11月15日（日）', ['https://example.com/c']],
    ],
  );
});

test('年をまたぐ日付も日本時間で正しく求める', () => {
  const groups = groupByDay([item({ publishedAt: '2026-12-31T15:00:00.000Z' })]);

  assert.deepEqual([groups[0].day, groups[0].label], ['2027-01-01', '1月1日（金）']);
});

test('記事が無ければ日付のまとまりも無い', () => {
  assert.deepEqual(groupByDay([]), []);
});

test('時刻は日本時間の HH:MM で表す', () => {
  assert.equal(formatTime('2026-11-15T15:05:00.000Z'), '00:05');
  assert.equal(formatTime('2026-11-16T03:42:48.000Z'), '12:42');
});

test('更新日時は日本時間の M/D HH:MM で表す', () => {
  assert.equal(formatDateTime('2026-11-16T12:00:00.000Z'), '11/16 21:00');
  assert.equal(formatDateTime('2026-12-31T15:09:00.000Z'), '1/1 00:09');
});

test('前回の訪問より後に集めた記事だけを新着とみなす', () => {
  const baseline = '2026-11-16T06:00:00.000Z';

  assert.equal(isNew(item({ firstSeenAt: '2026-11-16T09:00:00.000Z' }), baseline), true);
  assert.equal(isNew(item({ firstSeenAt: '2026-11-16T06:00:00.000Z' }), baseline), false);
  assert.equal(isNew(item({ firstSeenAt: '2026-11-15T00:00:00.000Z' }), baseline), false);
});

test('初めての訪問では、どの記事も新着にしない', () => {
  assert.equal(isNew(item(), null), false);
});

const MINUTE = 60 * 1000;
const visitOptions = { sessionGapMs: 30 * MINUTE };

test('初めての訪問では新着の基準が無く、今回見たデータの更新日時を覚える', () => {
  const state = nextVisitState(null, {
    now: Date.parse('2026-11-16T00:00:00.000Z'),
    updatedAt: '2026-11-15T21:00:00.000Z',
    ...visitOptions,
  });

  assert.deepEqual(state, {
    baseline: null,
    seenUntil: '2026-11-15T21:00:00.000Z',
    visitedAt: Date.parse('2026-11-16T00:00:00.000Z'),
  });
});

test('時間をおいて再び訪れたら、前回見たデータの更新日時を新着の基準にする', () => {
  const previous = {
    baseline: null,
    seenUntil: '2026-11-15T21:00:00.000Z',
    visitedAt: Date.parse('2026-11-16T00:00:00.000Z'),
  };

  const state = nextVisitState(previous, {
    now: Date.parse('2026-11-16T09:00:00.000Z'),
    updatedAt: '2026-11-16T06:00:00.000Z',
    ...visitOptions,
  });

  assert.deepEqual(state, {
    baseline: '2026-11-15T21:00:00.000Z',
    seenUntil: '2026-11-16T06:00:00.000Z',
    visitedAt: Date.parse('2026-11-16T09:00:00.000Z'),
  });
});

test('読んでいる最中の再読み込みでは基準を進めず、新着の印を消さない', () => {
  const previous = {
    baseline: '2026-11-15T21:00:00.000Z',
    seenUntil: '2026-11-16T06:00:00.000Z',
    visitedAt: Date.parse('2026-11-16T09:00:00.000Z'),
  };

  const state = nextVisitState(previous, {
    now: Date.parse('2026-11-16T09:10:00.000Z'),
    updatedAt: '2026-11-16T09:05:00.000Z',
    ...visitOptions,
  });

  assert.deepEqual(state, {
    baseline: '2026-11-15T21:00:00.000Z',
    seenUntil: '2026-11-16T09:05:00.000Z',
    visitedAt: Date.parse('2026-11-16T09:10:00.000Z'),
  });
});

test('保存されていた訪問記録が壊れていたら、初めての訪問として扱う', () => {
  const now = Date.parse('2026-11-16T09:00:00.000Z');
  const updatedAt = '2026-11-16T06:00:00.000Z';
  const first = { baseline: null, seenUntil: updatedAt, visitedAt: now };

  for (const broken of [{}, 'text', 42, { seenUntil: 123, visitedAt: 'x' }]) {
    assert.deepEqual(nextVisitState(broken, { now, updatedAt, ...visitOptions }), first);
  }
});

test('最後の更新から長く経っていたら、更新が止まっているとみなす', () => {
  const updatedAt = '2026-11-16T00:00:00.000Z';
  const maxAgeMs = 12 * 60 * MINUTE;

  assert.equal(isStale(updatedAt, Date.parse('2026-11-16T11:59:00.000Z'), maxAgeMs), false);
  assert.equal(isStale(updatedAt, Date.parse('2026-11-16T12:01:00.000Z'), maxAgeMs), true);
});
