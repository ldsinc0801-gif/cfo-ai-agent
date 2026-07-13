import type { MonthlySnapshot, AnnualStatement } from '../../types/trend.js';
import type { RatingInput } from '../../types/bank-rating.js';
import { effectiveAnnualDebtRepayment } from './imported-metrics.js';

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

/** 直近2スナップショットが隣接月なら「月次データ」とみなす（年次決算書は年単位で離れる）。 */
function isMonthlyData(snapshots: MonthlySnapshot[]): boolean {
  if (snapshots.length < 2) return false;
  const a = snapshots[snapshots.length - 2];
  const b = snapshots[snapshots.length - 1];
  const diff = (b.year * 12 + b.month) - (a.year * 12 + a.month);
  return diff === 1;
}

/**
 * 保存済みの年間決算書（期間残高＝決算整理仕訳を含む確定値）から RatingInput を組み立てる。
 * 月度合算(buildRatingInputFromSnapshots)は決算仕訳を取りこぼすため、期間残高がある場合は
 * こちらを使う。有利子負債の期首・返済元本の推定にだけ snapshots を併用する。
 * @param annuals 会計年度昇順の年間決算書（最後＝当期）
 * @param snapshots monthly_actuals（返済元本の推定用。無ければ空配列でよい）
 */
export function buildRatingInputFromAnnual(
  annuals: AnnualStatement[],
  snapshots: MonthlySnapshot[],
): RatingInput | null {
  if (!annuals || annuals.length === 0) return null;
  const sorted = [...annuals].sort((a, b) => a.fiscalYearEndYear - b.fiscalYearEndYear);
  const cur = sorted[sorted.length - 1];
  const prev = sorted.find((s) => s.fiscalYearEndYear === cur.fiscalYearEndYear - 1)
    ?? (sorted.length >= 2 ? sorted[sorted.length - 2] : null);

  const fixedAssets = Math.max(0, cur.totalAssets - cur.currentAssets);
  const fixedLiabilities = Math.max(0, cur.totalAssets - cur.netAssets - cur.currentLiabilities);

  return {
    totalAssets: cur.totalAssets,
    currentAssets: cur.currentAssets,
    fixedAssets,
    currentLiabilities: cur.currentLiabilities,
    fixedLiabilities,
    netAssets: cur.netAssets,
    interestBearingDebt: cur.interestBearingDebt,
    cashAndDeposits: cur.cashAndDeposits,
    // PL(フロー)は期間残高(年間確定値)
    revenue: cur.revenue,
    operatingIncome: cur.operatingIncome,
    ordinaryIncome: cur.ordinaryIncome,
    netIncome: cur.netIncome,
    interestExpense: cur.interestExpense,
    interestIncome: 0,
    depreciation: cur.depreciation,
    // 前期（前年度の年間決算書があれば成長性を採点）
    prevOrdinaryIncome: prev ? prev.ordinaryIncome : null,
    prevTotalAssets: prev ? prev.totalAssets : null,
    // 返済元本：返済計画表の手入力値を優先、無ければ期首−期末で概算（snapshots由来）
    annualDebtRepayment: effectiveAnnualDebtRepayment(snapshots),
    // 収益フロー履歴（最大3期の経常利益符号、古い順）
    profitFlowHistory: sorted.slice(-3).map((s) => signOf(s.ordinaryIncome)),
  };
}

export function buildRatingInputFromSnapshots(snapshots: MonthlySnapshot[]): RatingInput | null {
  if (!snapshots || snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const monthly = isMonthlyData(snapshots);

  // PL(フロー)は年間額で採点する。月次取込なら直近最大12か月を合算、年次決算書なら最新をそのまま。
  const plWindow = monthly ? snapshots.slice(-12) : [latest];
  const sum = (k: keyof MonthlySnapshot) => plWindow.reduce((s, m) => s + (Number(m[k]) || 0), 0);
  const revenue = sum('revenue');
  const operatingIncome = sum('operatingIncome');
  const ordinaryIncome = sum('ordinaryIncome');
  const netIncome = sum('netIncome');
  const interestExpense = sum('interestExpense');
  const depreciation = sum('depreciation');

  // 前期比較(成長性)は、年次決算書のときだけ「前期スナップショット」を使う。
  // 月次取込では前年同期の12か月合計が無いことが多いので算出不可(null)にする。
  const prev = (!monthly && snapshots.length >= 2) ? snapshots[snapshots.length - 2] : null;

  const fixedAssets = Math.max(0, (latest.totalAssets || 0) - (latest.currentAssets || 0));
  const fixedLiabilities = Math.max(
    0,
    (latest.totalAssets || 0) - (latest.netAssets || 0) - (latest.currentLiabilities || 0),
  );

  return {
    // BS(ストック)は常に最新スナップショット
    totalAssets: latest.totalAssets || 0,
    currentAssets: latest.currentAssets || 0,
    fixedAssets,
    currentLiabilities: latest.currentLiabilities || 0,
    fixedLiabilities,
    netAssets: latest.netAssets || 0,
    interestBearingDebt: latest.interestBearingDebt ?? 0,
    cashAndDeposits: latest.cashAndDeposits || 0,
    // PL(フロー)は年間額
    revenue,
    operatingIncome,
    ordinaryIncome,
    netIncome,
    interestExpense,
    interestIncome: 0, // 取込では未取得（影響軽微）
    depreciation,
    // 前期（月次取込では null＝算出不可）
    prevOrdinaryIncome: prev ? prev.ordinaryIncome || 0 : null,
    prevTotalAssets: prev ? prev.totalAssets || 0 : null,
    // 返済元本：返済計画表の手入力値を優先、無ければ期首−期末で概算
    annualDebtRepayment: effectiveAnnualDebtRepayment(snapshots),
    // 収益フロー履歴（最大3期の経常利益符号、古い順）
    profitFlowHistory: snapshots.slice(-3).map((s) => signOf(s.ordinaryIncome || 0)),
  };
}
