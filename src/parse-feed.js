import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
});

const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

// 属性付きの要素は { '#text': ..., '@_type': ... } の形で返ってくる
const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'object') return String(node['#text'] ?? '');
  return String(node);
};

const cleanTitle = (node) => textOf(node).replace(/[ \t\r\n]+/g, ' ').trim();

const toIso = (node) => {
  const date = new Date(textOf(node).trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isWebUrl = (url) => /^https?:\/\//i.test(url);

function atomLink(entry) {
  const links = asArray(entry.link);
  const page = links.find((link) => {
    const rel = typeof link === 'object' ? link['@_rel'] : undefined;
    return rel === undefined || rel === 'alternate';
  });
  if (page == null) return '';
  return typeof page === 'object' ? String(page['@_href'] ?? '') : String(page);
}

/**
 * RSS 2.0 / RSS 1.0 (RDF) / Atom のフィードを読み、見出しとリンクだけを取り出す。
 * @param {string} xml
 * @returns {{title: string, url: string, publishedAt: string | null}[]}
 */
export function parseFeed(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (error) {
    throw new Error(`フィードとして読めません: ${error.message}`);
  }

  let entries;
  if (doc.rss?.channel !== undefined) {
    entries = asArray(doc.rss.channel.item).map((item) => ({
      title: cleanTitle(item.title),
      url: textOf(asArray(item.link)[0]).trim(),
      publishedAt: toIso(item.pubDate ?? item['dc:date']),
    }));
  } else if (doc['rdf:RDF'] !== undefined) {
    entries = asArray(doc['rdf:RDF'].item).map((item) => ({
      title: cleanTitle(item.title),
      url: textOf(asArray(item.link)[0]).trim(),
      publishedAt: toIso(item['dc:date'] ?? item.pubDate),
    }));
  } else if (doc.feed !== undefined) {
    entries = asArray(doc.feed.entry).map((entry) => ({
      title: cleanTitle(entry.title),
      url: atomLink(entry).trim(),
      publishedAt: toIso(entry.published ?? entry.updated),
    }));
  } else {
    throw new Error('フィードとして読めません: RSS / RDF / Atom のいずれでもありません');
  }

  return entries.filter((entry) => entry.title !== '' && isWebUrl(entry.url));
}
