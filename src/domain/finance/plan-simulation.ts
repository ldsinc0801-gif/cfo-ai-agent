import type { MonthlySnapshot } from '../../types/trend.js';

/** 経営シミュレーターのスライダー値 */
export interface SimParams {
  revenueGrowth: number;   // 売上成長率 %
  cogsRatio: number;       // 原価率 %
  fixedCostChange: number; // 固定費増減 %
  employeeChange: number;  // 人員増減 人
  investment: number;      // 新規設備投資 万円
  repayment: number;       // 年間借入返済 万円
}

const INVEST_USEFUL_YEARS = 5;   // 新規設備投資の想定耐用年数（減価償却の概算）

/**
 * 最新スナップショット（＝財務分析AIが使う当期）に、シミュレーターのスライダー調整を
 * 反映した snapshots を返す。これを buildRatingInputFromSnapshots + calculateBankRating に
 * 通すことで、格付を「財務分析AIと同じ13指標モデル」で再計算できる。
 *
 * スライダーが全て中立（成長率0・原価率=実績・固定費0・人員0・投資0・返済0）のとき、
 * 出力は入力の最新スナップショットと一致する（＝基準値は財務分析AIと完全一致）。
 */
export function applySimParamsToSnapshots(snapshots: MonthlySnapshot[], p: SimParams): MonthlySnapshot[] {
  if (!snapshots || snapshots.length === 0) return snapshots;
  const latest = snapshots[snapshots.length - 1];

  // 年間借入返済スライダーは「現状の年間返済元本」を初期値とする絶対値なので、
  // 現状からの差分（追加返済）だけを負債に反映する（＝現状維持なら財務分析AIと一致）。
  const actualRepayYen = latest.annualDebtRepayment || 0;
  const actualRepayMan = actualRepayYen / 10000;

  // 全スライダーが現状維持（原価率も実績・返済も現状）なら、実績そのまま＝財務分析AIと完全一致
  const baselineCogsRatio = (latest.revenue || 0) > 0 ? (latest.costOfSales || 0) / (latest.revenue || 1) * 100 : 0;
  const neutral = !p.revenueGrowth && !p.fixedCostChange && !p.employeeChange && !p.investment
    && Math.abs((p.repayment || 0) - actualRepayMan) < 1
    && Math.abs((p.cogsRatio || 0) - baselineCogsRatio) < 1.0;
  if (neutral) return snapshots;

  const g = (p.revenueGrowth || 0) / 100;
  const revenue = Math.round((latest.revenue || 0) * (1 + g));
  const cogs = Math.max(0, Math.round(revenue * (p.cogsRatio || 0) / 100));
  const sga = Math.max(0, Math.round((latest.sgaExpenses || 0) * (1 + (p.fixedCostChange || 0) / 100)) + (p.employeeChange || 0) * PER_HEAD_COST);
  const operatingIncome = revenue - cogs - sga;

  // 営業外の差分（経常−営業）は実績どおり維持
  const nonOperating = (latest.ordinaryIncome || 0) - (latest.operatingIncome || 0);
  const ordinaryIncome = operatingIncome + nonOperating;

  // 税等の差分（経常−当期純利益）は実績の絶対額を維持 → 基準では純利益が実績と一致
  const baseNet = latest.netIncome ?? 0;
  const baseOrd = latest.ordinaryIncome || 0;
  const netIncome = ordinaryIncome - (baseOrd - baseNet);

  const depreciation = Math.max(0, Math.round((latest.depreciation || 0) + (p.investment || 0) * 10000 / INVEST_USEFUL_YEARS));
  // 現状の返済元本を超える「追加返済分」だけ負債を減らす（現状維持なら負債は据え置き＝財務分析AI一致）
  const extraRepayYen = (p.repayment || 0) * 10000 - actualRepayYen;
  const interestBearingDebt = Math.max(0, (latest.interestBearingDebt || 0) - extraRepayYen);
  const totalAssets = Math.max(1, (latest.totalAssets || 0) + (p.investment || 0) * 10000);
  const netAssets = (latest.netAssets || 0) + (netIncome - baseNet); // 利益の増減を純資産に反映

  const modified: MonthlySnapshot = {
    ...latest,
    revenue,
    costOfSales: cogs,
    grossProfit: revenue - cogs,
    sgaExpenses: sga,
    operatingIncome,
    ordinaryIncome,
    netIncome,
    depreciation,
    interestBearingDebt,
    totalAssets,
    netAssets,
  };

  return [...snapshots.slice(0, -1), modified];
}
