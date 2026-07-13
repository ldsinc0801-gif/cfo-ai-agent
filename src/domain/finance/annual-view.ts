import type { MonthlySnapshot } from '../../types/trend.js';

/**
 * 取込データ(monthly_actuals)から「決算書として見せるべき年間値」を組み立てる。
 *
 * 取込CSV（月次推移試算表）は各月度が別スナップショットとして保存されるため、
 * 最新1スナップショットをそのまま表示すると「単月（例: 4月度）」になってしまう。
 * 決算書ビューアで見せたいのは会計期間の確定値（＝CSVの「期間残高」列）なので、
 *  - PL(フロー)は当期の各月を合算（＝期間残高）
 *  - BS(ストック)は当期末（最新月）の残高
 * とする。これは buildRatingInputFromSnapshots と同じ考え方。
 */

export interface AnnualFigures {
  /** 会計期間の期末年 */
  fiscalYearEndYear: number;
  /** 会計期間の期末月 */
  fiscalYearEndMonth: number;
  /** 当期に含まれる月数（月次取込のとき。年次決算書なら1） */
  monthsInPeriod: number;
  /** 当期の開始年月（月次取込のとき。ラベル用） */
  startYear: number;
  startMonth: number;

  // --- PL（フロー：期間合算） ---
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  sgaExpenses: number;
  operatingIncome: number;
  ordinaryIncome: number;
  netIncome: number;
  depreciation: number;
  interestExpense: number;

  // --- BS（ストック：期末残高） ---
  cashAndDeposits: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  netAssets: number;
  accountsReceivable: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  interestBearingDebt: number;
}

export interface AnnualStatementView {
  current: AnnualFigures;
  /** 前期（前会計年度）。月次取込で前期が揃っていない場合や1期しか無い場合は null */
  previous: AnnualFigures | null;
  /** 月次推移データを年間合算したか（true）／年次決算書をそのまま使ったか（false） */
  isMonthlyData: boolean;
  /** 当期の期間ラベル（例: 「2025年5月〜2026年4月期」／「2026年3月期」） */
  periodLabel: string;
}

function ord(s: { year: number; month: number }): number {
  return s.year * 12 + s.month;
}

/** 直近2スナップショットが隣接月なら「月次データ」とみなす（年次決算書は年単位で離れる）。 */
function isMonthlyData(snapshots: MonthlySnapshot[]): boolean {
  if (snapshots.length < 2) return false;
  const a = snapshots[snapshots.length - 2];
  const b = snapshots[snapshots.length - 1];
  return ord(b) - ord(a) === 1;
}

/**
 * 決算月(fiscalMonth)を基準に、月(y,m)が属する「会計期末の序数」を返す。
 * 例: 決算月=3 なら 2025/4〜2026/3 は 期末=2026/3。
 */
function fiscalYearEndOrdinal(y: number, m: number, fiscalMonth: number): number {
  const feYear = m <= fiscalMonth ? y : y + 1;
  return feYear * 12 + fiscalMonth;
}

/** BS(期末残高)は当期のうち最も新しい月のスナップショットを採用 */
function pickPeriodEnd(months: MonthlySnapshot[]): MonthlySnapshot {
  return months.reduce((latest, s) => (ord(s) > ord(latest) ? s : latest), months[0]);
}

function num(v: number | null | undefined): number {
  return Number(v) || 0;
}

/** 月群（同一会計年度）を年間値に集計する。months は空でない前提。 */
function aggregate(months: MonthlySnapshot[], fiscalMonth: number, monthly: boolean): AnnualFigures {
  const end = pickPeriodEnd(months);
  const start = months.reduce((min, s) => (ord(s) < ord(min) ? s : min), months[0]);
  const sum = (k: keyof MonthlySnapshot) => months.reduce((acc, s) => acc + num(s[k] as number), 0);

  // PLフロー: 月次取込なら合算、年次決算書(1件)ならその値
  return {
    fiscalYearEndYear: end.year,
    fiscalYearEndMonth: end.month,
    monthsInPeriod: months.length,
    startYear: start.year,
    startMonth: start.month,
    revenue: sum('revenue'),
    costOfSales: sum('costOfSales'),
    grossProfit: sum('grossProfit'),
    sgaExpenses: sum('sgaExpenses'),
    operatingIncome: sum('operatingIncome'),
    ordinaryIncome: sum('ordinaryIncome'),
    netIncome: sum('netIncome'),
    depreciation: sum('depreciation'),
    interestExpense: sum('interestExpense'),
    // BSストック: 当期末残高
    cashAndDeposits: num(end.cashAndDeposits),
    currentAssets: num(end.currentAssets),
    currentLiabilities: num(end.currentLiabilities),
    totalAssets: num(end.totalAssets),
    netAssets: num(end.netAssets),
    accountsReceivable: end.accountsReceivable ?? null,
    inventory: end.inventory ?? null,
    accountsPayable: end.accountsPayable ?? null,
    interestBearingDebt: end.interestBearingDebt ?? 0,
  };
  void monthly;
}

function periodLabelOf(fig: AnnualFigures, monthly: boolean): string {
  if (!monthly || fig.monthsInPeriod <= 1) {
    return `${fig.fiscalYearEndYear}年${fig.fiscalYearEndMonth}月期`;
  }
  return `${fig.startYear}年${fig.startMonth}月〜${fig.fiscalYearEndYear}年${fig.fiscalYearEndMonth}月期`;
}

/**
 * @param snapshots monthly_actuals 全件（順不同可）
 * @param fiscalMonth テナントの決算月(1-12)。null なら最新スナップショットの月を期末とみなす。
 */
export function buildAnnualStatementView(
  snapshots: MonthlySnapshot[],
  fiscalMonth?: number | null,
): AnnualStatementView | null {
  if (!snapshots || snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => ord(a) - ord(b));
  const latest = sorted[sorted.length - 1];
  const monthly = isMonthlyData(sorted);

  if (!monthly) {
    // 年次決算書：各スナップショットが既に年間値。最新=当期、その前=前期。
    const current = aggregate([latest], latest.month, false);
    const prevSnap = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
    const previous = prevSnap ? aggregate([prevSnap], prevSnap.month, false) : null;
    return { current, previous, isMonthlyData: false, periodLabel: periodLabelOf(current, false) };
  }

  // 月次取込：決算月で会計年度にグルーピングして合算
  const fm = fiscalMonth && fiscalMonth >= 1 && fiscalMonth <= 12 ? fiscalMonth : latest.month;
  const groups = new Map<number, MonthlySnapshot[]>();
  for (const s of sorted) {
    const key = fiscalYearEndOrdinal(s.year, s.month, fm);
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }
  const currentKey = fiscalYearEndOrdinal(latest.year, latest.month, fm);
  const currentMonths = groups.get(currentKey)!;
  const prevMonths = groups.get(currentKey - 12) ?? null;

  const current = aggregate(currentMonths, fm, true);
  const previous = prevMonths && prevMonths.length > 0 ? aggregate(prevMonths, fm, true) : null;

  return {
    current,
    previous,
    isMonthlyData: true,
    periodLabel: periodLabelOf(current, true),
  };
}
