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
  // 営業運転資本の内訳（残高試算表から。営業運転資本＝売上債権＋棚卸資産−仕入債務）
  accountsReceivable?: number | null; // 売上債権（受取手形＋売掛金＋電子記録債権）
  inventory?: number | null;          // 棚卸資産（商品＋製品＋仕掛品＋原材料＋貯蔵品）
  accountsPayable?: number | null;    // 仕入債務（支払手形＋買掛金＋電子記録債務）
}

/** 販管費（販売費及び一般管理費）の科目別内訳の1行（期間残高＝年間値） */
export interface SgaBreakdownItem {
  name: string;   // 勘定科目名（例: 役員報酬）
  amount: number; // 期間残高（年間額）
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
