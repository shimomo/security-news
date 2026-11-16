const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 保存済みの記事に、今回取得した記事を合わせる。
 * 記事は URL で同一とみなし、公開日時の新しい順に並べて返す。
 *
 * @param {object[]} existing 保存済みの記事
 * @param {object[]} incoming 今回取得した記事（publishedAt は null のことがある）
 * @param {{now: Date, retentionDays: number}} options
 * @returns {{items: object[], added: number, changed: boolean}}
 */
export function mergeItems(existing, incoming, { now, retentionDays }) {
  const nowIso = now.toISOString();
  const oldestKept = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
  const isKept = (item) => item.publishedAt >= oldestKept;

  const byUrl = new Map(existing.map((item) => [item.url, item]));
  const seenThisRun = new Set();
  let added = 0;

  for (const item of incoming) {
    if (seenThisRun.has(item.url)) continue;
    seenThisRun.add(item.url);

    const known = byUrl.get(item.url);
    if (known) {
      byUrl.set(item.url, { ...known, title: item.title, category: item.category });
      continue;
    }

    const publishedAt = item.publishedAt === null || item.publishedAt > nowIso ? nowIso : item.publishedAt;
    const fresh = { ...item, publishedAt, firstSeenAt: nowIso };
    if (!isKept(fresh)) continue;
    byUrl.set(item.url, fresh);
    added += 1;
  }

  const items = [...byUrl.values()]
    .filter(isKept)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url));

  return { items, added, changed: JSON.stringify(items) !== JSON.stringify(existing) };
}
