import type { MonthlySnapshot } from '../../types/trend.js';
import type { RatingInput } from '../../types/bank-rating.js';

/**
 * ダッシュボード取込データ(monthly_actuals)から完全な RatingInput を組み立てる。
 * migration-016 で有利子負債・当期純利益・減価償却費・支払利息を保存するように
 * なったため、freee 連携なしでも 129 点満点の銀行格付を算出できる。
 *
 * - 最新スナップショットを当期、その前を前期として扱う。
 * - 固定資産 = 総資産 - 流動資産、固定負債 = 総資産 - 純資産 - 流動負債 で補完。
 * - 前提: 決算書(年次)の取込を想定。単月試算表のみだと PL が単月値になる点に注意。
 */
function signOf(n: number): 'positive' | 'negative' | 'zero' {
  return n > 0 ? 'positive' : n < 0 ? 'negative' : 'zero';
}

export function buildRatingInputFromSnapshots(snapshots: MonthlySnapshot[]): RatingInput | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;

  const fixedAssets = Math.max(0, (latest.totalAssets || 0) - (latest.currentAssets || 0));
  const fixedLiabilities = Math.max(
    0,
    (latest.totalAssets || 0) - (latest.netAssets || 0) - (latest.currentLiabilities || 0),
  );

  return {
    // BS
    totalAssets: latest.totalAssets || 0,
    currentAssets: latest.currentAssets || 0,
    fixedAssets,
    currentLiabilities: latest.currentLiabilities || 0,
    fixedLiabilities,
    netAssets: latest.netAssets || 0,
    interestBearingDebt: latest.interestBearingDebt ?? 0,
    cashAndDeposits: latest.cashAndDeposits || 0,
    // PL
    revenue: latest.revenue || 0,
    operatingIncome: latest.operatingIncome || 0,
    ordinaryIncome: latest.ordinaryIncome || 0,
    netIncome: latest.netIncome ?? 0,
    interestExpense: latest.interestExpense ?? 0,
    interestIncome: 0, // 取込では未取得（影響軽微）
    depreciation: latest.depreciation ?? 0,
    // 前期
    prevOrdinaryIncome: prev ? prev.ordinaryIncome || 0 : null,
    prevTotalAssets: prev ? prev.totalAssets || 0 : null,
    // 返済（取込では未取得）
    annualDebtRepayment: null,
    // 収益フロー履歴（最大3期の経常利益符号、古い順）
    profitFlowHistory: snapshots.slice(-3).map((s) => signOf(s.ordinaryIncome || 0)),
  };
}
