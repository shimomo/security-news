// 画面に依存しない処理。ブラウザと Node のテストの両方から読み込む。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const pad = (value) => String(value).padStart(2, '0');

// UTC 用のメソッドで日本時間の年月日・時分を読めるよう、9 時間進めた Date を返す
const toJst = (iso) => new Date(Date.parse(iso) + JST_OFFSET_MS);

// 全角半角と大文字小文字の違いを無視して比べるための形にそろえる
const normalize = (text) => text.normalize('NFKC').toLowerCase();

/**
 * @param {object[]} items
 * @param {{category: string, source: string, query: string}} filter 'all' は絞り込みなし
 */
export function filterItems(items, { category, source, query }) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (source !== 'all' && item.source !== source) return false;
    if (terms.length === 0) return true;
    const title = normalize(item.title);
    return terms.every((term) => title.includes(term));
  });
}

/**
 * 並び順を保ったまま、日本時間の日付ごとにまとめる。
 * @param {object[]} items
 * @returns {{day: string, label: string, items: object[]}[]}
 */
export function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const jst = toJst(item.publishedAt);
    const day = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
    let group = groups.at(-1);
    if (group?.day !== day) {
      const label = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${WEEKDAYS[jst.getUTCDay()]}）`;
      group = { day, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export function formatTime(iso) {
  const jst = toJst(iso);
  return `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`;
}

export function formatDateTime(iso) {
  const jst = toJst(iso);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${formatTime(iso)}`;
}

/**
 * @param {{firstSeenAt: string}} item
 * @param {string | null} baseline 前回の訪問で見たデータの更新日時。初回は null
 */
export function isNew(item, baseline) {
  return baseline !== null && item.firstSeenAt > baseline;
}

const isVisitState = (value) =>
  typeof value === 'object' &&
  value !== null &&
  typeof value.seenUntil === 'string' &&
  typeof value.visitedAt === 'number' &&
  (value.baseline === null || typeof value.baseline === 'string');

/**
 * 訪問のたびに、新着の基準 (baseline) と次回に引き継ぐ記録を決める。
 * 前回の読み込みから sessionGapMs 以内なら読んでいる最中の再読み込みとみなし、基準を進めない。
 *
 * @param {unknown} previous 前回保存した記録。無い・壊れているときは初めての訪問として扱う
 * @param {{now: number, updatedAt: string, sessionGapMs: number}} current
 * @returns {{baseline: string | null, seenUntil: string, visitedAt: number}}
 */
export function nextVisitState(previous, { now, updatedAt, sessionGapMs }) {
  if (!isVisitState(previous)) return { baseline: null, seenUntil: updatedAt, visitedAt: now };
  const isSameVisit = now - previous.visitedAt <= sessionGapMs;
  return {
    baseline: isSameVisit ? previous.baseline : previous.seenUntil,
    seenUntil: updatedAt,
    visitedAt: now,
  };
}

export function isStale(updatedAt, now, maxAgeMs) {
  return now - Date.parse(updatedAt) > maxAgeMs;
}
