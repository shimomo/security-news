// フィードを集めて site/data/news.json を更新する。GitHub Actions と手元の両方から実行する。
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { collect, serialize } from './collect.js';

const ROOT = new URL('../', import.meta.url);
const SOURCES_FILE = new URL('sources.json', ROOT);
const DATA_FILE = new URL('site/data/news.json', ROOT);

const RETENTION_DAYS = 90;
const TIMEOUT_MS = 20_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; security-news-collector/1.0)';

async function fetchText(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error.cause?.code ?? error.cause?.message;
    throw new Error(detail ? `${error.message} (${detail})` : error.message);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function readExistingItems() {
  let text;
  try {
    text = await readFile(DATA_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return JSON.parse(text).items;
}

async function main() {
  const sources = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  const existing = await readExistingItems();
  const now = new Date();

  const result = await collect({ sources, existing, fetchText, now, retentionDays: RETENTION_DAYS });

  for (const source of result.sources) {
    console.log(source.ok ? `OK   ${source.id}` : `FAIL ${source.id}: ${source.error}`);
  }
  console.log(`新着 ${result.added} 件 / 合計 ${result.items.length} 件`);

  await mkdir(new URL('./', DATA_FILE), { recursive: true });
  await writeFile(
    DATA_FILE,
    serialize({ updatedAt: now.toISOString(), sources: result.sources, items: result.items }),
  );

  // 記事に変化があったときだけコミットできるよう、ワークフローへ結果を渡す
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nadded=${result.added}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
