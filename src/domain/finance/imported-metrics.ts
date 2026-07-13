import type { MonthlySnapshot, AnnualStatement } from '../../types/trend.js';

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

/**
 * @param snapshots monthly_actuals（推移・月商・返済推定に使用）
 * @param annual 年間決算書（期間残高＝確定値）。あれば年間指標はこちらを正とする。
 */
export function computeImportedMetrics(
  snapshots: MonthlySnapshot[],
  annual?: AnnualStatement | null,
): ImportedMetrics | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];

  // BS(ストック)・PL(年間フロー)は、期間残高(annual)があればそれを正とする。
  // 無ければ月次から近似（PLは直近12か月合算。ただし決算仕訳は含まれない点に注意）。
  const monthly = snapshots.length >= 2
    && (snapshots[snapshots.length - 1].year * 12 + snapshots[snapshots.length - 1].month)
       - (snapshots[snapshots.length - 2].year * 12 + snapshots[snapshots.length - 2].month) === 1;
  const cfWindow = monthly ? snapshots.slice(-12) : [latest];
  const sumSnap = (k: keyof MonthlySnapshot) => cfWindow.reduce((s, m) => s + (Number(m[k]) || 0), 0);

  // 年間BSが未取得(総資産0)なら最新スナップショットのBSにフォールバック
  const bs = (annual && annual.totalAssets > 0) ? annual : latest;
  const interestBearingDebt = (annual && annual.totalAssets > 0)
    ? annual.interestBearingDebt : (latest.interestBearingDebt ?? 0);
  const annualRevenue = annual ? annual.revenue : sumSnap('revenue');
  // 月商＝平均月商（年商/12）。単月(latest)は季節変動で歪むため使わない。
  const monthlyRevenue = annualRevenue > 0 ? annualRevenue / 12 : latest.revenue;
  const annualOperating = annual ? annual.operatingIncome : sumSnap('operatingIncome');
  const annualOrdinary = annual ? annual.ordinaryIncome : sumSnap('ordinaryIncome');
  const annualDepreciation = annual ? annual.depreciation : sumSnap('depreciation');
  const simpleCashFlow = annualOrdinary + annualDepreciation;

  return {
    latest,
    monthsCount: snapshots.length,
    equityRatio: pct(bs.netAssets, bs.totalAssets),
    currentRatio: pct(bs.currentAssets, bs.currentLiabilities),
    cashMonthsRatio:
      monthlyRevenue > 0 ? Math.round((bs.cashAndDeposits / monthlyRevenue) * 10) / 10 : null,
    operatingMargin: pct(annualOperating, annualRevenue),
    ordinaryMargin: pct(annualOrdinary, annualRevenue),
    debtRepaymentYears:
      interestBearingDebt <= 0 ? 0 : simpleCashFlow > 0 ? Math.round((interestBearingDebt / simpleCashFlow) * 10) / 10 : null,
    interestDependency: pct(interestBearingDebt, bs.totalAssets),
    interestBearingDebt,
    monthlyRevenue,
    trend: snapshots.slice(-12).map((s) => ({
      label: `${s.year}/${s.month}`,
      revenue: s.revenue,
      ordinaryIncome: s.ordinaryIncome,
    })),
  };
}
