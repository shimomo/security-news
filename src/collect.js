import { classify } from './classify.js';
import { mergeItems } from './merge.js';
import { parseFeed } from './parse-feed.js';

async function fetchSource(source, fetchText) {
  const xml = await fetchText(source.feed);
  return parseFeed(xml).map((entry) => ({
    title: entry.title,
    url: entry.url,
    source: source.id,
    category: source.category ?? classify(entry.title),
    publishedAt: entry.publishedAt,
  }));
}

/**
 * すべての取得元からフィードを取り、保存済みの記事と合わせる。
 * 一部の取得元が失敗しても続行し、結果は取得元ごとに sources へ記録する。
 *
 * @param {object} params
 * @param {{id: string, name: string, site: string, feed: string, category?: string}[]} params.sources
 * @param {object[]} params.existing 保存済みの記事
 * @param {(url: string) => Promise<string>} params.fetchText フィードの本文を取得する関数
 * @param {Date} params.now
 * @param {number} params.retentionDays
 */
export async function collect({ sources, existing, fetchText, now, retentionDays }) {
  const settled = await Promise.allSettled(sources.map((source) => fetchSource(source, fetchText)));

  if (settled.every((result) => result.status === 'rejected')) {
    const reasons = settled.map((result, i) => `${sources[i].id}: ${result.reason.message}`).join(' / ');
    throw new Error(`すべての取得元で失敗しました (${reasons})`);
  }

  const incoming = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const merged = mergeItems(existing, incoming, { now, retentionDays });

  const sourceResults = sources.map(({ id, name, site }, i) =>
    settled[i].status === 'fulfilled'
      ? { id, name, site, ok: true }
      : { id, name, site, ok: false, error: settled[i].reason.message },
  );

  return { ...merged, sources: sourceResults };
}

/**
 * 保存用の JSON 文字列を作る。差分を追いやすいよう、記事 1 件を 1 行にする。
 * @param {{updatedAt: string, sources: object[], items: object[]}} data
 */
export function serialize({ updatedAt, sources, items }) {
  const lines = (list) => (list.length === 0 ? '[]' : `[\n${list.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]`);
  return `{\n  "updatedAt": ${JSON.stringify(updatedAt)},\n  "sources": ${lines(sources)},\n  "items": ${lines(items)}\n}\n`;
}
