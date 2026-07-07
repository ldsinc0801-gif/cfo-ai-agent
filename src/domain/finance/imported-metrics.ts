import type { MonthlySnapshot } from '../../types/trend.js';

/**
 * ダッシュボードで取り込んだ月次データ(monthly_actuals)から、
 * **有利子負債などの追加データ無しで正確に算出できる**銀行評価指標だけを計算する。
 *
 * 債務償還年数・借入依存度などは有利子負債が必要なため、ここでは扱わない
 * （それらは freee 連携 or 詳細取込で対応）。
 */
export interface ImportedMetrics {
  latest: MonthlySnapshot;
  monthsCount: number;
  equityRatio: number | null;     // 自己資本比率 %  = 純資産 / 総資産
  currentRatio: number | null;    // 流動比率 %      = 流動資産 / 流動負債
  cashMonthsRatio: number | null; // 現預金月商倍率  = 現預金 / 月商（か月）
  operatingMargin: number | null; // 営業利益率 %
  ordinaryMargin: number | null;  // 経常利益率 %
  monthlyRevenue: number;         // 月商（最新月の売上）
  /** 売上・経常利益の推移（グラフ用、最新から最大12か月） */
  trend: { label: string; revenue: number; ordinaryIncome: number }[];
}

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

export function computeImportedMetrics(snapshots: MonthlySnapshot[]): ImportedMetrics | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const monthlyRevenue = latest.revenue;

  return {
    latest,
    monthsCount: snapshots.length,
    equityRatio: pct(latest.netAssets, latest.totalAssets),
    currentRatio: pct(latest.currentAssets, latest.currentLiabilities),
    cashMonthsRatio:
      monthlyRevenue > 0 ? Math.round((latest.cashAndDeposits / monthlyRevenue) * 10) / 10 : null,
    operatingMargin: pct(latest.operatingIncome, latest.revenue),
    ordinaryMargin: pct(latest.ordinaryIncome, latest.revenue),
    monthlyRevenue,
    trend: snapshots.slice(-12).map((s) => ({
      label: `${s.year}/${s.month}`,
      revenue: s.revenue,
      ordinaryIncome: s.ordinaryIncome,
    })),
  };
}
