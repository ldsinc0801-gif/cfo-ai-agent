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

const PER_HEAD_COST = 4_000_000; // 1人あたり年間人件費の概算（人員増減の固定費影響）
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

  // 全スライダーが中立（原価率も実績とほぼ同じ）なら、実績そのまま＝財務分析AIと完全一致させる
  const baselineCogsRatio = (latest.revenue || 0) > 0 ? (latest.costOfSales || 0) / (latest.revenue || 1) * 100 : 0;
  const neutral = !p.revenueGrowth && !p.fixedCostChange && !p.employeeChange && !p.investment && !p.repayment
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
  const interestBearingDebt = Math.max(0, (latest.interestBearingDebt || 0) - (p.repayment || 0) * 10000);
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
