/**
 * 税区分マスター（freee / 弥生 互換）
 *
 * AI仕訳生成・UI編集・freee送信・弥生CSVのすべてで使用する共通の税区分。
 * 税率は税区分から自動逆算される。
 */

export interface TaxCategory {
  /** 表示名（freee側のマスター名と一致するように設計） */
  name: string;
  /** 税率 (10 / 8 / 0) */
  rate: number;
  /** 仕入(expense) / 売上(income) / その他(neutral) */
  side: 'income' | 'expense' | 'neutral';
  /** UI 表示時のグループラベル */
  group: '売上' | '仕入' | 'その他';
}

export const TAX_CATEGORIES: TaxCategory[] = [
  // 売上系
  { name: '課税売上10%',     rate: 10, side: 'income',  group: '売上' },
  { name: '課税売上8%(軽)',  rate: 8,  side: 'income',  group: '売上' },
  { name: '課税売上8%',      rate: 8,  side: 'income',  group: '売上' },
  { name: '課税売上',        rate: 10, side: 'income',  group: '売上' },
  // 仕入系
  { name: '課対仕入10%',     rate: 10, side: 'expense', group: '仕入' },
  { name: '課対仕入8%(軽)',  rate: 8,  side: 'expense', group: '仕入' },
  { name: '課対仕入8%',      rate: 8,  side: 'expense', group: '仕入' },
  { name: '課対仕入',        rate: 10, side: 'expense', group: '仕入' },
  // その他
  { name: '対象外',          rate: 0,  side: 'neutral', group: 'その他' },
  { name: '不課税',          rate: 0,  side: 'neutral', group: 'その他' },
  { name: '非課売上',        rate: 0,  side: 'income',  group: 'その他' },
  { name: '非課仕入',        rate: 0,  side: 'expense', group: 'その他' },
];

const NAME_INDEX = new Map(TAX_CATEGORIES.map(c => [c.name, c]));

/** 税区分名から TaxCategory を取得（不正な値なら undefined） */
export function getTaxCategory(name: string): TaxCategory | undefined {
  return NAME_INDEX.get(name);
}

/** 名前一覧（UI セレクトの初期化用） */
export function getAllTaxCategoryNames(): string[] {
  return TAX_CATEGORIES.map(c => c.name);
}

/** 税区分名から税率を取得（不明なら0） */
export function rateFromTaxCategory(name: string): number {
  return NAME_INDEX.get(name)?.rate ?? 0;
}

/**
 * 旧データ補完用: 借方科目と税率から税区分を推定する。
 * 売上系科目（debitAccountに「売上」を含む）かつ rate=10 → 課税売上10% など。
 */
export function inferTaxCategory(debitAccount: string, taxRate: number): string {
  const isIncome = (debitAccount || '').includes('売上');
  if (taxRate === 10) return isIncome ? '課税売上10%' : '課対仕入10%';
  if (taxRate === 8)  return isIncome ? '課税売上8%(軽)' : '課対仕入8%(軽)';
  return '対象外';
}
