import type { FreeeBSResponse, FreeeBSBalance } from '../../types/freee.js';
import type { BalanceSheet } from '../../types/accounting.js';

/**
 * freee試算表(BS)レスポンスを内部BalanceSheet型に変換する
 */
export function parseBSResponse(bsResponse: FreeeBSResponse, year: number, month: number): BalanceSheet {
  const balances = bsResponse.trial_bs.balances;

  const currentAssets = findTotalByCategory(balances, '流動資産') ?? 0;
  const fixedAssets = findTotalByCategory(balances, '固定資産') ?? 0;
  const totalAssets = currentAssets + fixedAssets;

  const currentLiabilities = findTotalByCategory(balances, '流動負債') ?? 0;
  const fixedLiabilities = findTotalByCategory(balances, '固定負債') ?? 0;
  // freeeでは「負債」合計行がある場合、そこから流動負債を引いて固定負債を算出
  const totalLiabilitiesFromApi = findTotalByCategory(balances, '負債');
  const totalLiabilities = totalLiabilitiesFromApi ?? (currentLiabilities + fixedLiabilities);

  const netAssets = findTotalByCategory(balances, '純資産') ?? (totalAssets - totalLiabilities);

  // 現金預金を検索
  const cashAndDeposits = findCashAndDeposits(balances);

  return {
    year,
    month,
    currentAssets,
    fixedAssets,
    totalAssets,
    currentLiabilities,
    fixedLiabilities,
    totalLiabilities,
    netAssets,
    cashAndDeposits,
    totalLiabilitiesAndNetAssets: totalLiabilities + netAssets,
  };
}

function findTotalByCategory(balances: FreeeBSBalance[], categoryName: string): number | null {
  const totalLine = balances.find(
    (b) => b.total_line && b.account_category_name === categoryName
  );
  if (totalLine) return totalLine.closing_balance;

  const items = balances.filter(
    (b) => !b.total_line && b.account_category_name === categoryName
  );
  if (items.length > 0) {
    return items.reduce((sum, item) => sum + item.closing_balance, 0);
  }

  const parentItems = balances.filter(
    (b) => b.total_line && b.parent_account_category_name === categoryName
  );
  if (parentItems.length > 0) {
    return parentItems.reduce((sum, item) => sum + item.closing_balance, 0);
  }

  return null;
}

/**
 * 現金預金の残高を取得
 *
 * freeeでは account_category_name が「現金・預金」で、
 * account_item_name は銀行口座ごとに個別（例：「○○銀行 普通預金」「△△信金 当座預金」）
 * のためカテゴリ名でもマッチさせる
 */
function findCashAndDeposits(balances: FreeeBSBalance[]): number {
  // まずカテゴリ名「現金・預金」の合計行を探す
  const categoryTotal = findTotalByCategory(balances, '現金・預金');
  if (categoryTotal !== null) return categoryTotal;

  // カテゴリ名に「現金」「預金」を含む個別項目を合算
  const cashByCategory = balances.filter(
    (b) => !b.total_line && (b.account_category_name.includes('現金') || b.account_category_name.includes('預金'))
  );
  if (cashByCategory.length > 0) {
    return cashByCategory.reduce((sum, item) => sum + item.closing_balance, 0);
  }

  // フォールバック: 科目名に「現金」「預金」を含む項目
  const cashKeywords = ['現金', '預金', '小口現金'];
  const cashItems = balances.filter(
    (b) => !b.total_line && cashKeywords.some((keyword) => b.account_item_name.includes(keyword))
  );
  if (cashItems.length > 0) {
    return cashItems.reduce((sum, item) => sum + item.closing_balance, 0);
  }

  return 0;
}
