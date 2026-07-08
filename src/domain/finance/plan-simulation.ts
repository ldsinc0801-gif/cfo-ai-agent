import type { MonthlySnapshot } from '../../types/trend.js';

/** 経営シミュレーターのスライダー値 */
export interface SimParams {
  revenueGrowth: number;   // 売上成長率 %
  cogsRatio: number;       // 原価率 %
  fixedCostChange: number; // 固定費増減 %
  employeeChange: number;  // 人員増減 人（銀行格付には影響させない＝生産性のみ）
  investment: number;      // 新規設備投資 万円
  repayment: number;       // 年間借入返済 万円（現状の返済元本を初期値とする絶対値）
}

const INVEST_USEFUL_YEARS = 5;   // 新規設備投資の想定耐用年数（減価償却の概算）

/** 直近2スナップショットが隣接月なら「月次データ」とみなす。 */
function isMonthly(snapshots: MonthlySnapshot[]): boolean {
  if (snapshots.length < 2) return false;
  const a = snapshots[snapshots.length - 2];
  const b = snapshots[snapshots.length - 1];
  return (b.year * 12 + b.month) - (a.year * 12 + a.month) === 1;
}

/**
 * シミュレーターのスライダー調整を反映した snapshots を返す。
 * これを buildRatingInputFromSnapshots + calculateBankRating に通すことで、格付を
 * 「財務分析AIと同じ13指標モデル」で再計算できる。
 *
 * - PL(フロー)は年間額ベースで調整する（月次取込なら直近12か月合計、年次なら当期）。
 * - スライダーが全て現状維持のときは入力をそのまま返す（＝基準値は財務分析AIと完全一致）。
 */
export function applySimParamsToSnapshots(snapshots: MonthlySnapshot[], p: SimParams): MonthlySnapshot[] {
  if (!snapshots || snapshots.length === 0) return snapshots;
  const latest = snapshots[snapshots.length - 1];
  const monthly = isMonthly(snapshots);

  // 年間フロー(基準)。月次なら直近12か月を合算、年次なら当期。
  const win = monthly ? snapshots.slice(-12) : [latest];
  const sum = (k: keyof MonthlySnapshot) => win.reduce((s, m) => s + (Number(m[k]) || 0), 0);
  const baseRevenue = sum('revenue');
  const baseCogs = sum('costOfSales');
  const baseSga = sum('sgaExpenses');
  const baseOperating = sum('operatingIncome');
  const baseOrdinary = sum('ordinaryIncome');
  const baseNet = sum('netIncome');
  const baseDepr = sum('depreciation');
  const baseInterestExp = sum('interestExpense');

  const actualRepayYen = latest.annualDebtRepayment || 0;
  const actualRepayMan = actualRepayYen / 10000;
  const baselineCogsRatio = baseRevenue > 0 ? baseCogs / baseRevenue * 100 : 0;

  // 現状維持（原価率も実績・返済も現状）なら実績そのまま＝財務分析AIと完全一致
  const neutral = !p.revenueGrowth && !p.fixedCostChange && !p.employeeChange && !p.investment
    && Math.abs((p.repayment || 0) - actualRepayMan) < 1
    && Math.abs((p.cogsRatio || 0) - baselineCogsRatio) < 1.0;
  if (neutral) return snapshots;

  const g = (p.revenueGrowth || 0) / 100;
  const revenue = Math.round(baseRevenue * (1 + g));
  const cogs = Math.max(0, Math.round(revenue * (p.cogsRatio || 0) / 100));
  const sga = Math.max(0, Math.round(baseSga * (1 + (p.fixedCostChange || 0) / 100)));
  const operatingIncome = revenue - cogs - sga;

  // 営業外・税等の差分は実績の絶対額を維持（＝基準では経常・純利益が実績と一致）
  const nonOperating = baseOrdinary - baseOperating;
  const ordinaryIncome = operatingIncome + nonOperating;
  const netIncome = ordinaryIncome - (baseOrdinary - baseNet);

  const depreciation = Math.max(0, Math.round(baseDepr + (p.investment || 0) * 10000 / INVEST_USEFUL_YEARS));
  // 現状の返済元本を超える「追加返済分」だけ負債を減らす
  const extraRepayYen = (p.repayment || 0) * 10000 - actualRepayYen;
  const interestBearingDebt = Math.max(0, (latest.interestBearingDebt || 0) - extraRepayYen);
  const totalAssets = Math.max(1, (latest.totalAssets || 0) + (p.investment || 0) * 10000);
  const netAssets = (latest.netAssets || 0) + (netIncome - baseNet); // 利益の増減を純資産に反映

  // 調整後の「年間PL＋最新BS」を1つの合成スナップショットにする。
  const synthetic: MonthlySnapshot = {
    ...latest,
    revenue,
    costOfSales: cogs,
    grossProfit: revenue - cogs,
    sgaExpenses: sga,
    operatingIncome,
    ordinaryIncome,
    netIncome,
    depreciation,
    interestExpense: baseInterestExp,
    interestBearingDebt,
    totalAssets,
    netAssets,
  };

  // 月次: 合成1件を年間として採点（前期比は算出不可＝月次と同じ扱い）。
  // 年次: 前期スナップショットを残し、成長性(前期比)を維持する。
  return monthly ? [synthetic] : [...snapshots.slice(0, -1), synthetic];
}
