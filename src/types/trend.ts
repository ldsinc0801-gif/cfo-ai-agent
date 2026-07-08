/** 月次推移データ（ダッシュボード用） */
export interface MonthlySnapshot {
  year: number;
  month: number;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  sgaExpenses: number;
  operatingIncome: number;
  ordinaryIncome: number;
  cashAndDeposits: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  netAssets: number;
  // 銀行評価用の追加項目（migration-016。取込で埋まらない場合は 0）
  interestBearingDebt?: number; // 有利子負債（期末残高）
  openingInterestBearingDebt?: number | null; // 期首有利子負債（前期末残高。BS前期列から。無ければnull）
  netIncome?: number;           // 当期純利益
  depreciation?: number;        // 減価償却費
  interestExpense?: number;     // 支払利息
  annualDebtRepayment?: number | null; // 年間返済元本（手入力。未入力は null）
}

/** 月次目標データ */
export interface MonthlyTarget {
  year: number;
  month: number;
  revenue: number;
  grossProfit: number;
  ordinaryIncome: number;
}

export interface TrendData {
  months: MonthlySnapshot[];
  targets: MonthlyTarget[];
}
