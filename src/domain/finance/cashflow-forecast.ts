import type { MonthlySnapshot } from '../../types/trend.js';

export interface CashflowForecast {
  currentCash: number;
  monthlyNetCF: number;       // 直近の月次純増減（現預金差分の平均）
  hasEnoughData: boolean;     // 予測に足る月次データ(2か月以上)があるか
  projection: { label: string; balance: number }[]; // 先N月の残高見込み
  shortage: { label: string; balance: number } | null; // 初めてマイナスになる月
  runwayMonths: number | null; // 現金が尽きるまでの月数（純増減がマイナス時）
}

/**
 * 取込データ(monthly_actuals)の現預金推移から、先N月の資金繰りを簡易予測する。
 * 月次純増減 = 直近最大6か月の「現預金の前月差分」の平均。
 * 決算書1期分だけ等でデータが足りない場合は hasEnoughData=false。
 */
export function forecastCashflow(snapshots: MonthlySnapshot[], months = 6): CashflowForecast | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const currentCash = latest.cashAndDeposits || 0;

  const deltas: number[] = [];
  for (let i = Math.max(1, snapshots.length - 6); i < snapshots.length; i++) {
    deltas.push((snapshots[i].cashAndDeposits || 0) - (snapshots[i - 1].cashAndDeposits || 0));
  }
  const hasEnoughData = deltas.length >= 1;
  const monthlyNetCF = hasEnoughData ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;

  const projection: { label: string; balance: number }[] = [];
  let bal = currentCash;
  let shortage: { label: string; balance: number } | null = null;
  for (let k = 1; k <= months; k++) {
    bal += monthlyNetCF;
    let m = latest.month + k;
    let y = latest.year;
    while (m > 12) { m -= 12; y++; }
    const label = `${y}/${m}`;
    projection.push({ label, balance: bal });
    if (bal < 0 && !shortage) shortage = { label, balance: bal };
  }

  const runwayMonths = monthlyNetCF < 0 ? Math.floor(currentCash / -monthlyNetCF) : null;

  return { currentCash, monthlyNetCF, hasEnoughData, projection, shortage, runwayMonths };
}
