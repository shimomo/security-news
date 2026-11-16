import {
  filterItems,
  formatDateTime,
  formatTime,
  groupByDay,
  isNew,
  isStale,
  nextVisitState,
} from './core.js';

const DATA_URL = 'data/news.json';
const PAGE_SIZE = 200;
const VISIT_KEY = 'security-news:visit';
const SESSION_GAP_MS = 30 * 60 * 1000;
// 収集は 3 時間ごと。数回分とどこおったら知らせる
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const TAG_LABELS = { incident: '漏えい', vuln: '脆弱性' };

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const state = {
  items: [],
  sourceNames: new Map(),
  baseline: null,
  filter: { category: 'all', source: 'all', query: '' },
  limit: PAGE_SIZE,
};

// 訪問の記録を読み書きする。保存できない環境でも一覧は表示する
function loadBaseline(updatedAt) {
  let previous = null;
  try {
    previous = JSON.parse(localStorage.getItem(VISIT_KEY));
  } catch {
    previous = null;
  }
  const next = nextVisitState(previous, { now: Date.now(), updatedAt, sessionGapMs: SESSION_GAP_MS });
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(next));
  } catch {
    // 保存できなければ、次回は初めての訪問として扱われるだけ
  }
  return next.baseline;
}

function renderItem(item) {
  const link = el('a', {
    href: item.url,
    target: '_blank',
    rel: 'noopener noreferrer',
    textContent: item.title,
  });
  const meta = el('span', { className: 'meta' });
  const tagLabel = TAG_LABELS[item.category];
  if (tagLabel) meta.append(el('span', { className: `tag tag-${item.category}`, textContent: tagLabel }));
  meta.append(el('span', { className: 'source', textContent: state.sourceNames.get(item.source) ?? item.source }));

  const row = el('li', { className: 'item' }, [
    el('time', { dateTime: item.publishedAt, textContent: formatTime(item.publishedAt) }),
    link,
    meta,
  ]);
  if (isNew(item, state.baseline)) {
    row.classList.add('is-new');
    link.prepend(el('span', { className: 'visually-hidden', textContent: '新着 ' }));
  }
  return row;
}

function render() {
  const filtered = filterItems(state.items, state.filter);
  const visible = filtered.slice(0, state.limit);

  $('list').replaceChildren(
    ...groupByDay(visible).map((group) =>
      el('section', { className: 'day' }, [
        el('h2', { textContent: group.label }),
        el('ul', {}, group.items.map(renderItem)),
      ]),
    ),
  );

  const remaining = filtered.length - visible.length;
  $('count').textContent = `${filtered.length} 件`;
  $('empty').hidden = filtered.length > 0;
  $('more').hidden = remaining === 0;
  $('more').textContent = `さらに表示（残り ${remaining} 件）`;
}

function renderStatus(data) {
  const status = $('status');
  status.replaceChildren(`最終更新 ${formatDateTime(data.updatedAt)}`);

  const newCount = state.items.filter((item) => isNew(item, state.baseline)).length;
  if (newCount > 0) {
    status.append(' ・ ', el('span', { className: 'new-count', textContent: `新着 ${newCount} 件` }));
  }
  if (isStale(data.updatedAt, Date.now(), STALE_AFTER_MS)) {
    status.append(' ・ ', el('span', { className: 'stale', textContent: '更新が止まっている可能性があります' }));
  }
}

function renderSources(sources) {
  for (const source of sources) {
    $('source').append(el('option', { value: source.id, textContent: source.name }));
  }

  const links = sources.flatMap((source, i) => [
    i === 0 ? '' : '、',
    el('a', { href: source.site, target: '_blank', rel: 'noopener noreferrer', textContent: source.name }),
  ]);
  $('sources').replaceChildren(...links);

  const failed = sources.filter((source) => !source.ok).map((source) => source.name);
  if (failed.length > 0) {
    $('failed').textContent = `直近の収集で取得できなかった配信元: ${failed.join('、')}`;
    $('failed').hidden = false;
  }
}

function bindControls() {
  const update = (changes) => {
    Object.assign(state.filter, changes);
    state.limit = PAGE_SIZE;
    render();
  };

  $('categories').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    for (const other of $('categories').querySelectorAll('.chip')) {
      other.setAttribute('aria-pressed', String(other === chip));
    }
    update({ category: chip.dataset.category });
  });
  $('source').addEventListener('change', (event) => update({ source: event.target.value }));
  $('query').addEventListener('input', (event) => update({ query: event.target.value }));
  $('more').addEventListener('click', () => {
    state.limit += PAGE_SIZE;
    render();
  });
}

async function main() {
  let data;
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    console.error(error);
    $('status').textContent = 'データを読み込めませんでした。時間をおいて再読み込みしてください。';
    return;
  }

  state.items = data.items;
  state.sourceNames = new Map(data.sources.map((source) => [source.id, source.name]));
  state.baseline = loadBaseline(data.updatedAt);

  renderSources(data.sources);
  renderStatus(data);
  bindControls();
  render();
}

main();
