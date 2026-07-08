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
  debtRepaymentYears: number | null; // 債務償還年数 = 有利子負債 /(経常利益+減価償却費)
  interestDependency: number | null; // 借入依存度 % = 有利子負債 / 総資産
  interestBearingDebt: number;       // 有利子負債
  monthlyRevenue: number;         // 月商（最新月の売上）
  /** 売上・経常利益の推移（グラフ用、最新から最大12か月） */
  trend: { label: string; revenue: number; ordinaryIncome: number }[];
}

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * 期首（前期末）有利子負債。決算書BSの前期列（openingInterestBearingDebt）を最優先し、
 * 無ければ「一つ前のスナップショット（前期）の期末残高」を期首とみなす。
 */
export function openingInterestBearingDebt(snapshots: MonthlySnapshot[]): number | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  if (latest.openingInterestBearingDebt != null) return latest.openingInterestBearingDebt;
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  return prev?.interestBearingDebt ?? null;
}

/**
 * 分析に使う年間返済元本。
 *  1) 返済計画表で入れた手入力値（annualDebtRepayment）があればそれを優先
 *  2) 無ければ 期首残高 − 期末残高 で概算（新規借入が無い前提。負なら0）
 *  3) いずれも不明なら null
 */
export function effectiveAnnualDebtRepayment(snapshots: MonthlySnapshot[]): number | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  if (latest.annualDebtRepayment != null) return latest.annualDebtRepayment;
  const opening = openingInterestBearingDebt(snapshots);
  const ending = latest.interestBearingDebt ?? null;
  if (opening != null && ending != null) return Math.max(0, opening - ending);
  return null;
}

/** 年間返済元本が「返済計画表の実績値」か「期首−期末の推定値」かを示す。 */
export function annualDebtRepaymentSource(snapshots: MonthlySnapshot[]): 'actual' | 'estimated' | 'none' {
  if (!snapshots || snapshots.length === 0) return 'none';
  const latest = snapshots[snapshots.length - 1];
  if (latest.annualDebtRepayment != null) return 'actual';
  const opening = openingInterestBearingDebt(snapshots);
  if (opening != null && (latest.interestBearingDebt ?? null) != null) return 'estimated';
  return 'none';
}

export function computeImportedMetrics(snapshots: MonthlySnapshot[]): ImportedMetrics | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const monthlyRevenue = latest.revenue;
  const interestBearingDebt = latest.interestBearingDebt ?? 0;
  const simpleCashFlow = (latest.ordinaryIncome || 0) + (latest.depreciation ?? 0);

  return {
    latest,
    monthsCount: snapshots.length,
    equityRatio: pct(latest.netAssets, latest.totalAssets),
    currentRatio: pct(latest.currentAssets, latest.currentLiabilities),
    cashMonthsRatio:
      monthlyRevenue > 0 ? Math.round((latest.cashAndDeposits / monthlyRevenue) * 10) / 10 : null,
    operatingMargin: pct(latest.operatingIncome, latest.revenue),
    ordinaryMargin: pct(latest.ordinaryIncome, latest.revenue),
    debtRepaymentYears:
      interestBearingDebt <= 0 ? 0 : simpleCashFlow > 0 ? Math.round((interestBearingDebt / simpleCashFlow) * 10) / 10 : null,
    interestDependency: pct(interestBearingDebt, latest.totalAssets),
    interestBearingDebt,
    monthlyRevenue,
    trend: snapshots.slice(-12).map((s) => ({
      label: `${s.year}/${s.month}`,
      revenue: s.revenue,
      ordinaryIncome: s.ordinaryIncome,
    })),
  };
}
