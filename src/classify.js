// 見出しのキーワードだけで判定する。上から順に調べ、最初に当てはまった分類を返す。

// 実際に起きた事故を示す語
const INCIDENT = [
  '漏えい', '漏洩', '流出', '不正アクセス', '不正ログイン', '不正利用', '不正送金',
  'ランサム', '紛失', '盗難', '誤送信', '誤送付', '誤公開', '誤掲載', '改ざん',
  '持ち出', 'リスト型攻撃', '侵害',
];

// 催しやサービスの告知。脆弱性という語を含んでいても脆弱性情報ではない
const PROMOTION = ['セミナー', 'ウェビナー', 'キャンペーン', '脆弱性診断'];

// 脆弱性情報や注意喚起を示す語
const VULN = [
  '脆弱性', '注意喚起', 'CVE-', 'ゼロデイ', 'アップデート', '更新プログラム',
  'セキュリティ更新', 'パッチ', '修正版', 'サポート終了', 'に注意', 'ご注意',
];

// 脆弱性の話題でも使われるため、脆弱性の語が無いときだけ事故として扱う語
const ATTACK = ['サイバー攻撃', '攻撃被害'];

const includesAny = (title, words) => words.some((word) => title.includes(word));

/**
 * @param {string} title
 * @returns {'incident' | 'vuln' | 'other'}
 */
export function classify(title) {
  if (includesAny(title, INCIDENT)) return 'incident';
  if (includesAny(title, PROMOTION)) return 'other';
  if (includesAny(title, VULN)) return 'vuln';
  if (includesAny(title, ATTACK)) return 'incident';
  return 'other';
}
