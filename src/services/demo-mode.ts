/**
 * デモモード管理
 * 営業先でfreee連携なし・AI API消費なしでデモ実演できる
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const DEMO_FILE = path.resolve('data/demo-mode.json');

export interface DemoProfile {
  id: string;
  companyName: string;
  industry: string;
  description: string;
  employees: number;
  revenue: number;       // 年間売上（円）
  // プリセットデータ
  ratingInput: any;
  rating: any;
  additional: any;
  aiCommentary: string;
  trendMonths: any[];
  targets: any[];
  chatHistory: any[];
  // 事業計画AI用
  annualKpi: any;
}

interface DemoState {
  enabled: boolean;
  profileId: string | null;
}

function loadState(): DemoState {
  try {
    if (fs.existsSync(DEMO_FILE)) return JSON.parse(fs.readFileSync(DEMO_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return { enabled: false, profileId: null };
}

function saveState(state: DemoState): void {
  const dir = path.dirname(DEMO_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DEMO_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function isDemoMode(): boolean {
  return loadState().enabled;
}

export function getDemoProfileId(): string | null {
  const s = loadState();
  return s.enabled ? s.profileId : null;
}

export function enableDemoMode(profileId: string): void {
  saveState({ enabled: true, profileId });

  // デモプロファイルの年間KPI・月次目標をデータファイルに反映
  const profile = DEMO_PROFILES.find(p => p.id === profileId);
  if (profile) {
    // 年間KPI
    if (profile.annualKpi) {
      const kpiPath = path.resolve('data/plans/annual-kpi.json');
      const kpiDir = path.dirname(kpiPath);
      if (!fs.existsSync(kpiDir)) fs.mkdirSync(kpiDir, { recursive: true });
      fs.writeFileSync(kpiPath, JSON.stringify(profile.annualKpi, null, 2), 'utf-8');
    }
    // 月次目標
    if (profile.targets.length > 0) {
      const targetsPath = path.resolve('data/plans/monthly-targets.json');
      const targetsDir = path.dirname(targetsPath);
      if (!fs.existsSync(targetsDir)) fs.mkdirSync(targetsDir, { recursive: true });
      fs.writeFileSync(targetsPath, JSON.stringify({ targets: profile.targets, updatedAt: new Date().toISOString(), notes: 'デモデータ' }, null, 2), 'utf-8');
    }

    // 秘書AI：会社情報・振込先
    const companySettingsPath = path.resolve('data/secretary/company-settings.json');
    const settingsDir = path.dirname(companySettingsPath);
    if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
    const demoCompanySettings: Record<string, any> = {
      consulting: {
        companyName: '株式会社フローリッシュ', postalCode: '100-0005', address: '東京都千代田区丸の内1-8-3',
        representative: '川口 直人', registrationNumber: 'T1234567890123',
        bankName: '三菱UFJ銀行', branchName: '丸の内支店', accountType: '普通預金', accountNumber: '1234567', accountHolder: 'カ）フローリッシュ',
      },
      restaurant: {
        companyName: '株式会社さくら食堂', postalCode: '150-0001', address: '東京都渋谷区神宮前3-15-8',
        representative: '佐藤 花子', registrationNumber: 'T9876543210987',
        bankName: 'みずほ銀行', branchName: '渋谷支店', accountType: '普通預金', accountNumber: '7654321', accountHolder: 'カ）サクラショクドウ',
      },
      construction: {
        companyName: '大和建設株式会社', postalCode: '330-0854', address: '埼玉県さいたま市大宮区桜木町2-3-1',
        representative: '田中 太郎', registrationNumber: 'T5555666677778',
        bankName: '埼玉りそな銀行', branchName: '大宮支店', accountType: '普通預金', accountNumber: '3456789', accountHolder: 'ヤマトケンセツ（カ',
      },
    };
    if (demoCompanySettings[profileId]) {
      fs.writeFileSync(companySettingsPath, JSON.stringify(demoCompanySettings[profileId], null, 2), 'utf-8');
    }

    // 秘書AI：顧客別請求設定
    const billingPath = path.resolve('data/secretary/billing-configs.json');
    const demoBilling: Record<string, any[]> = {
      consulting: [
        { customerName: '株式会社ABC', closingDay: 31, invoiceDay: 1, dueDateType: 'end_next' },
        { customerName: 'DEFコンサル', closingDay: 25, invoiceDay: 27, dueDateType: 'end_next' },
        { customerName: '株式会社GHI', closingDay: 31, invoiceDay: 5, dueDateType: 'end_next' },
      ],
      restaurant: [
        { customerName: '食材卸 山田商店', closingDay: 31, invoiceDay: 5, dueDateType: 'end_next' },
        { customerName: 'ケータリング 田中様', closingDay: 15, invoiceDay: 20, dueDateType: 'end_next' },
      ],
      construction: [
        { customerName: '鈴木工務店', closingDay: 31, invoiceDay: 10, dueDateType: 'end_next' },
        { customerName: '佐々木ハウジング', closingDay: 25, invoiceDay: 1, dueDateType: 'end_next' },
        { customerName: '田村不動産', closingDay: 31, invoiceDay: 5, dueDateType: 'end_next' },
      ],
    };
    if (demoBilling[profileId]) {
      fs.writeFileSync(billingPath, JSON.stringify(demoBilling[profileId], null, 2), 'utf-8');
    }
  }

  logger.info(`デモモードON: ${profileId}`);
}

export function disableDemoMode(): void {
  saveState({ enabled: false, profileId: null });
  logger.info('デモモードOFF');
}

export function getDemoProfile(): DemoProfile | null {
  const state = loadState();
  if (!state.enabled || !state.profileId) return null;
  return DEMO_PROFILES.find(p => p.id === state.profileId) || null;
}

// ==========================================================================
// デモプロファイル（業種別3パターン）
// ==========================================================================

const DEMO_PROFILES: DemoProfile[] = [
  // --- 1. コンサルティング会社 ---
  {
    id: 'consulting',
    companyName: '株式会社フローリッシュ',
    industry: '経営コンサルティング',
    description: '中小企業向け財務コンサル・AI活用支援',
    employees: 8,
    revenue: 85000000,
    ratingInput: {
      totalAssets: 48500000, currentAssets: 35200000, fixedAssets: 13300000,
      currentLiabilities: 19000000, fixedLiabilities: 8500000, netAssets: 21000000,
      interestBearingDebt: 12000000, cashAndDeposits: 18500000,
      revenue: 85000000, operatingIncome: 10200000, ordinaryIncome: 9800000,
      netIncome: 6860000, interestExpense: 180000, interestIncome: 5000,
      depreciation: 1200000, prevOrdinaryIncome: 7500000, prevTotalAssets: 42000000,
      annualDebtRepayment: 3000000, profitFlowHistory: ['positive', 'positive', 'positive'],
    },
    rating: {
      totalScore: 92, maxScore: 129, rank: 'B', rankLabel: '良好（正常先）',
      metrics: [
        { id: 'equity_ratio', name: '自己資本比率', category: 'stability', value: 43.3, unit: '%', score: 7, maxScore: 10, level: 'good', comment: '自己資本が十分に蓄積されており、財務基盤は安定している' },
        { id: 'current_ratio', name: '流動比率', category: 'stability', value: 185.3, unit: '%', score: 10, maxScore: 10, level: 'excellent', comment: '短期的な支払能力は十分に確保されている' },
        { id: 'ordinary_profit_margin', name: '売上高経常利益率', category: 'profitability', value: 11.5, unit: '%', score: 7, maxScore: 7, level: 'excellent', comment: '高い利益率を維持しており、収益力が高い' },
        { id: 'roa', name: 'ROA', category: 'profitability', value: 20.2, unit: '%', score: 7, maxScore: 7, level: 'excellent', comment: '資産効率が非常に高い' },
        { id: 'profit_flow', name: '収益フロー', category: 'profitability', value: 3, unit: '期連続', score: 5, maxScore: 5, level: 'excellent', comment: '3期連続黒字で安定した収益基盤' },
        { id: 'debt_repayment_years', name: '債務償還年数', category: 'repayment', value: 1.5, unit: '年', score: 10, maxScore: 10, level: 'excellent', comment: '返済能力は非常に高い' },
      ],
      positives: ['自己資本比率43%で安定した財務基盤', '流動比率185%で短期支払い能力は十分', '売上高経常利益率11.5%の高収益体質', '3期連続黒字の安定した収益力'],
      negatives: ['売上規模8,500万円はまだ成長余地あり', '自己資本額は蓄積途上'],
      cautions: ['急成長期は運転資金の増加に注意', '人件費率の上昇傾向を注視'],
      actions: [
        { title: '売上1億円突破に向けた営業強化', description: '既存顧客のアップセルと新規開拓', priority: 'high', category: 'growth' },
        { title: '自己資本の積み増し', description: '利益の内部留保を優先', priority: 'medium', category: 'stability' },
        { title: '月次財務レビュー体制の構築', description: 'freee連携で毎月の財務データを自動取得', priority: 'medium', category: 'management' },
      ],
      executiveSummary: ['銀行格付92点（B+ランク・正常先）と良好な財務状態。', '収益性（利益率11.5%、ROA 20%）と返済能力が優秀。', '来期は売上1億円突破と自己資本の積み増しが成長のカギ。'],
      deepDiveQuestions: ['来期の設備投資や人材採用の計画は？', '主要取引先の集中度はどの程度？', 'サブスクリプション型収益モデルへの移行は？'],
      stabilityScore: 24, stabilityMax: 37, profitabilityScore: 19, profitabilityMax: 19,
      growthScore: 18, growthMax: 33, repaymentScore: 24, repaymentMax: 45,
    },
    additional: {
      totalAssetTurnover: 1.75, totalAssetTurnoverComment: '資産を効率的に活用',
      simpleCashFlow: 8060000, simpleCashFlowComment: '約806万円のCFを創出', simpleCashFlowNote: '簡易CF = 純利益 + 減価償却費',
    },
    aiCommentary: `## AI財務コメンタリー

### 総合評価
株式会社フローリッシュは、銀行格付92点（B+ランク）と中小企業として非常に優秀な財務状態にあります。特に**収益性**と**返済能力**が際立っており、金融機関からの信用力は高い水準です。

### 強み
- **高い利益率**: 売上高経常利益率11.5%は業界平均を大きく上回ります
- **健全な財務体質**: 自己資本比率43%、流動比率185%と安定性が高い
- **強い返済能力**: 債務償還年数1.5年は金融機関から高く評価されるレベル

### 今後の注目ポイント
来期の売上1億円達成に向けて、**既存顧客の単価アップ**と**新規サービスの立ち上げ**が重要です。
人件費率の上昇傾向には注意が必要ですが、売上成長が伴えば問題ありません。

### 経営者へのメッセージ
「数字で見える安心」を持ちながら、積極的な成長投資ができるフェーズです。月次レビューを習慣化し、データに基づく意思決定を続けていきましょう。`,
    trendMonths: [
      { year: 2025, month: 10, revenue: 6800000, costOfSales: 2700000, grossProfit: 4100000, sgaExpenses: 3500000, operatingIncome: 600000, ordinaryIncome: 580000, cashAndDeposits: 16200000, currentAssets: 32000000, currentLiabilities: 18500000, totalAssets: 45000000, netAssets: 19000000 },
      { year: 2025, month: 11, revenue: 7200000, costOfSales: 2900000, grossProfit: 4300000, sgaExpenses: 3500000, operatingIncome: 800000, ordinaryIncome: 780000, cashAndDeposits: 16800000, currentAssets: 33000000, currentLiabilities: 18700000, totalAssets: 46000000, netAssets: 19500000 },
      { year: 2025, month: 12, revenue: 9200000, costOfSales: 3700000, grossProfit: 5500000, sgaExpenses: 3600000, operatingIncome: 1900000, ordinaryIncome: 1850000, cashAndDeposits: 17500000, currentAssets: 34000000, currentLiabilities: 18800000, totalAssets: 47000000, netAssets: 20000000 },
      { year: 2026, month: 1, revenue: 6500000, costOfSales: 2600000, grossProfit: 3900000, sgaExpenses: 3500000, operatingIncome: 400000, ordinaryIncome: 380000, cashAndDeposits: 17200000, currentAssets: 34500000, currentLiabilities: 18900000, totalAssets: 47500000, netAssets: 20200000 },
      { year: 2026, month: 2, revenue: 7800000, costOfSales: 3100000, grossProfit: 4700000, sgaExpenses: 3500000, operatingIncome: 1200000, ordinaryIncome: 1170000, cashAndDeposits: 18000000, currentAssets: 35000000, currentLiabilities: 19000000, totalAssets: 48000000, netAssets: 20600000 },
      { year: 2026, month: 3, revenue: 8500000, costOfSales: 3400000, grossProfit: 5100000, sgaExpenses: 3600000, operatingIncome: 1500000, ordinaryIncome: 1460000, cashAndDeposits: 18500000, currentAssets: 35200000, currentLiabilities: 19000000, totalAssets: 48500000, netAssets: 21000000 },
    ],
    targets: [
      // 過去月（実績と比較可能）
      { year: 2025, month: 10, revenue: 7000000, grossProfit: 4200000, ordinaryIncome: 700000 },
      { year: 2025, month: 11, revenue: 7500000, grossProfit: 4500000, ordinaryIncome: 850000 },
      { year: 2025, month: 12, revenue: 8800000, grossProfit: 5300000, ordinaryIncome: 1600000 },
      { year: 2026, month: 1, revenue: 7000000, grossProfit: 4200000, ordinaryIncome: 500000 },
      { year: 2026, month: 2, revenue: 7500000, grossProfit: 4500000, ordinaryIncome: 1000000 },
      { year: 2026, month: 3, revenue: 8000000, grossProfit: 4800000, ordinaryIncome: 1200000 },
      // 未来月
      { year: 2026, month: 4, revenue: 7500000, grossProfit: 4500000, ordinaryIncome: 900000 },
      { year: 2026, month: 5, revenue: 7800000, grossProfit: 4700000, ordinaryIncome: 1000000 },
      { year: 2026, month: 6, revenue: 8200000, grossProfit: 4900000, ordinaryIncome: 1100000 },
      { year: 2026, month: 7, revenue: 8500000, grossProfit: 5100000, ordinaryIncome: 1200000 },
      { year: 2026, month: 8, revenue: 8500000, grossProfit: 5100000, ordinaryIncome: 1200000 },
      { year: 2026, month: 9, revenue: 8800000, grossProfit: 5300000, ordinaryIncome: 1300000 },
    ],
    chatHistory: [],
    annualKpi: {
      fiscalYear: '2027年3月期',
      targetRevenue: 100000000,
      targetProfit: 15000000,
      targetMargin: 15,
      targetEquityRatio: 50,
      targetProductivity: 1250,
      employeeCount: 8,
      customKpis: [
        { id: 'ck-demo-1', name: 'アポ数', target: 30, actual: 22, unit: '件', format: 'number', scope: 'monthly' },
        { id: 'ck-demo-2', name: '契約率', target: 40, actual: 36, unit: '%', format: 'number', scope: 'annual' },
        { id: 'ck-demo-3', name: '顧客数', target: 50, actual: 38, unit: '社', format: 'number', scope: 'annual' },
        { id: 'ck-demo-4', name: '平均単価', target: 200, actual: 178, unit: '万円', format: 'number', scope: 'annual' },
      ],
    },
  },

  // --- 2. 飲食業 ---
  {
    id: 'restaurant',
    companyName: '株式会社さくら食堂',
    industry: '飲食業',
    description: '地域密着型レストラン3店舗経営',
    employees: 25,
    revenue: 180000000,
    ratingInput: {
      totalAssets: 95000000, currentAssets: 28000000, fixedAssets: 67000000,
      currentLiabilities: 32000000, fixedLiabilities: 35000000, netAssets: 28000000,
      interestBearingDebt: 45000000, cashAndDeposits: 12000000,
      revenue: 180000000, operatingIncome: 7200000, ordinaryIncome: 5400000,
      netIncome: 3780000, interestExpense: 1800000, interestIncome: 0,
      depreciation: 4500000, prevOrdinaryIncome: 4200000, prevTotalAssets: 90000000,
      annualDebtRepayment: 8000000, profitFlowHistory: ['positive', 'positive', 'negative'],
    },
    rating: {
      totalScore: 68, maxScore: 129, rank: 'C', rankLabel: '要注意先（要改善）',
      metrics: [
        { id: 'equity_ratio', name: '自己資本比率', category: 'stability', value: 29.5, unit: '%', score: 5, maxScore: 10, level: 'fair', comment: '業界平均程度だが、もう少し積み増しが望ましい' },
        { id: 'current_ratio', name: '流動比率', category: 'stability', value: 87.5, unit: '%', score: 3, maxScore: 10, level: 'warning', comment: '100%を下回っており、短期的な支払いに注意が必要' },
        { id: 'ordinary_profit_margin', name: '売上高経常利益率', category: 'profitability', value: 3.0, unit: '%', score: 3, maxScore: 7, level: 'fair', comment: '飲食業として標準的だが、改善余地あり' },
        { id: 'debt_repayment_years', name: '債務償還年数', category: 'repayment', value: 5.4, unit: '年', score: 5, maxScore: 10, level: 'fair', comment: '返済計画の見直しを検討すべき水準' },
      ],
      positives: ['売上1.8億円と一定の事業規模を確保', '前期比28%の増益で回復傾向', '3店舗体制による収益の分散'],
      negatives: ['流動比率87%で短期支払い能力に懸念', '借入依存度が高い（有利子負債4,500万円）', '過去に赤字期あり'],
      cautions: ['食材原価の上昇リスク', '人手不足による人件費上昇圧力', '借入金の返済負担が大きい'],
      actions: [
        { title: '原価率の改善', description: 'メニュー見直しと仕入れ先の再交渉で原価率2%改善を目指す', priority: 'high', category: 'profitability' },
        { title: '借入金の借り換え', description: '金利条件の良い融資への借り換えを検討', priority: 'high', category: 'finance' },
        { title: 'テイクアウト・デリバリー強化', description: '新たな売上チャネルで月商+50万円を目指す', priority: 'medium', category: 'growth' },
      ],
      executiveSummary: ['銀行格付68点（Cランク・要注意先）で改善が必要な状態。', '売上は堅調だが利益率と財務安全性に課題。', '原価管理と借入条件の改善が急務。'],
      deepDiveQuestions: ['各店舗ごとの収益状況は？', '食材原価率の推移は？', '人件費をどこまで最適化できるか？'],
      stabilityScore: 15, stabilityMax: 37, profitabilityScore: 11, profitabilityMax: 19,
      growthScore: 18, growthMax: 33, repaymentScore: 15, repaymentMax: 45,
    },
    additional: {
      totalAssetTurnover: 1.89, totalAssetTurnoverComment: '飲食業として標準的な資産回転率',
      simpleCashFlow: 8280000, simpleCashFlowComment: '約828万円のCFだが、借入返済が大きい', simpleCashFlowNote: '簡易CF = 純利益 + 減価償却費',
    },
    aiCommentary: `## AI財務コメンタリー

### 総合評価
株式会社さくら食堂は、銀行格付68点（Cランク）で**改善が必要な財務状態**です。売上は1.8億円と事業基盤はありますが、利益率と財務安全性に課題があります。

### 重要な課題
- **流動比率87%**: 短期の支払い能力が不足気味です。突発的な支出に対応できない可能性があります
- **借入依存**: 有利子負債4,500万円の返済負担が利益を圧迫しています
- **利益率3%**: 飲食業の平均的な水準ですが、食材費・人件費の上昇で圧迫される恐れ

### 改善プラン
1. **即効性のある施策**: メニューの価格改定（3-5%の値上げ）と食材ロスの削減
2. **中期施策**: 借入金の借り換えで金利負担を軽減
3. **成長施策**: テイクアウト事業の拡大で新規売上確保

### 経営者へのメッセージ
飲食業は日々のオペレーション管理が財務に直結します。まず**月次での原価率管理**を徹底し、利益率を1%改善するだけで年間180万円の利益増加が見込めます。`,
    trendMonths: [
      { year: 2025, month: 10, revenue: 14500000, costOfSales: 5800000, grossProfit: 8700000, sgaExpenses: 8100000, operatingIncome: 600000, ordinaryIncome: 450000, cashAndDeposits: 11000000, currentAssets: 26000000, currentLiabilities: 31000000, totalAssets: 92000000, netAssets: 26000000 },
      { year: 2025, month: 11, revenue: 15200000, costOfSales: 6100000, grossProfit: 9100000, sgaExpenses: 8200000, operatingIncome: 900000, ordinaryIncome: 700000, cashAndDeposits: 11200000, currentAssets: 27000000, currentLiabilities: 31500000, totalAssets: 93000000, netAssets: 26500000 },
      { year: 2025, month: 12, revenue: 18500000, costOfSales: 7400000, grossProfit: 11100000, sgaExpenses: 8500000, operatingIncome: 2600000, ordinaryIncome: 2200000, cashAndDeposits: 12500000, currentAssets: 28500000, currentLiabilities: 32000000, totalAssets: 94500000, netAssets: 27500000 },
      { year: 2026, month: 1, revenue: 13800000, costOfSales: 5500000, grossProfit: 8300000, sgaExpenses: 8100000, operatingIncome: 200000, ordinaryIncome: -100000, cashAndDeposits: 11500000, currentAssets: 27500000, currentLiabilities: 32000000, totalAssets: 94000000, netAssets: 27200000 },
      { year: 2026, month: 2, revenue: 14000000, costOfSales: 5600000, grossProfit: 8400000, sgaExpenses: 8100000, operatingIncome: 300000, ordinaryIncome: 100000, cashAndDeposits: 11800000, currentAssets: 27800000, currentLiabilities: 32000000, totalAssets: 94500000, netAssets: 27500000 },
      { year: 2026, month: 3, revenue: 16000000, costOfSales: 6400000, grossProfit: 9600000, sgaExpenses: 8300000, operatingIncome: 1300000, ordinaryIncome: 1000000, cashAndDeposits: 12000000, currentAssets: 28000000, currentLiabilities: 32000000, totalAssets: 95000000, netAssets: 28000000 },
    ],
    targets: [
      { year: 2026, month: 4, revenue: 15000000, grossProfit: 9000000, ordinaryIncome: 500000 },
      { year: 2026, month: 5, revenue: 15500000, grossProfit: 9300000, ordinaryIncome: 600000 },
      { year: 2026, month: 6, revenue: 16000000, grossProfit: 9600000, ordinaryIncome: 700000 },
      { year: 2026, month: 7, revenue: 14500000, grossProfit: 8700000, ordinaryIncome: 400000 },
      { year: 2026, month: 8, revenue: 13500000, grossProfit: 8100000, ordinaryIncome: 200000 },
      { year: 2026, month: 9, revenue: 15000000, grossProfit: 9000000, ordinaryIncome: 500000 },
    ],
    chatHistory: [],
    annualKpi: {
      fiscalYear: '2027年3月期',
      targetRevenue: 200000000,
      targetProfit: 10000000,
      targetMargin: 5,
      targetEquityRatio: 35,
      targetProductivity: 720,
      employeeCount: 25,
      customKpis: [
        { id: 'ck-demo-r1', name: '客単価', target: 1800, actual: 1650, unit: '円', format: 'number', scope: 'annual' },
        { id: 'ck-demo-r2', name: '1日来客数', target: 120, actual: 105, unit: '人', format: 'number', scope: 'monthly' },
        { id: 'ck-demo-r3', name: 'リピート率', target: 60, actual: 52, unit: '%', format: 'number', scope: 'annual' },
        { id: 'ck-demo-r4', name: '原価率', target: 35, actual: 38, unit: '%', format: 'number', scope: 'monthly' },
      ],
    },
  },

  // --- 3. 建設業 ---
  {
    id: 'construction',
    companyName: '大和建設株式会社',
    industry: '建設業',
    description: '住宅リフォーム・小規模建築',
    employees: 15,
    revenue: 250000000,
    ratingInput: {
      totalAssets: 120000000, currentAssets: 75000000, fixedAssets: 45000000,
      currentLiabilities: 48000000, fixedLiabilities: 22000000, netAssets: 50000000,
      interestBearingDebt: 30000000, cashAndDeposits: 25000000,
      revenue: 250000000, operatingIncome: 15000000, ordinaryIncome: 13500000,
      netIncome: 9450000, interestExpense: 600000, interestIncome: 10000,
      depreciation: 3000000, prevOrdinaryIncome: 12000000, prevTotalAssets: 115000000,
      annualDebtRepayment: 6000000, profitFlowHistory: ['positive', 'positive', 'positive'],
    },
    rating: {
      totalScore: 85, maxScore: 129, rank: 'B', rankLabel: '良好（正常先）',
      metrics: [
        { id: 'equity_ratio', name: '自己資本比率', category: 'stability', value: 41.7, unit: '%', score: 7, maxScore: 10, level: 'good', comment: '建設業として良好な水準' },
        { id: 'current_ratio', name: '流動比率', category: 'stability', value: 156.3, unit: '%', score: 7, maxScore: 10, level: 'good', comment: '十分な短期支払い能力を確保' },
        { id: 'ordinary_profit_margin', name: '売上高経常利益率', category: 'profitability', value: 5.4, unit: '%', score: 5, maxScore: 7, level: 'good', comment: '建設業として良好な利益率' },
        { id: 'debt_repayment_years', name: '債務償還年数', category: 'repayment', value: 2.4, unit: '年', score: 8, maxScore: 10, level: 'good', comment: '健全な返済能力' },
      ],
      positives: ['売上2.5億円の安定した事業規模', '自己資本比率41%で財務基盤が安定', '3期連続黒字', '手元現預金2,500万円の確保'],
      negatives: ['工事の季節変動による売上のばらつき', '受注から入金までのタイムラグ'],
      cautions: ['資材価格の高騰リスク', '人手不足による外注費の増加'],
      actions: [
        { title: '受注管理の強化', description: '工事台帳のデジタル化で進捗と採算を可視化', priority: 'high', category: 'management' },
        { title: 'リフォーム事業の拡大', description: '単価は低いが安定受注で平準化', priority: 'medium', category: 'growth' },
        { title: '資金繰り管理の自動化', description: 'freee連携で入出金予測を自動化', priority: 'medium', category: 'finance' },
      ],
      executiveSummary: ['銀行格付85点（Bランク・正常先）で良好な財務状態。', '建設業として安定した収益性と財務健全性を維持。', '受注管理の効率化と季節変動への対策が今後のカギ。'],
      deepDiveQuestions: ['主要な受注先の業種分布は？', '資材調達の固定契約は？', 'DX化の現状と計画は？'],
      stabilityScore: 21, stabilityMax: 37, profitabilityScore: 15, profitabilityMax: 19,
      growthScore: 20, growthMax: 33, repaymentScore: 22, repaymentMax: 45,
    },
    additional: {
      totalAssetTurnover: 2.08, totalAssetTurnoverComment: '建設業として高い資産効率',
      simpleCashFlow: 12450000, simpleCashFlowComment: '約1,245万円のCFを創出', simpleCashFlowNote: '簡易CF = 純利益 + 減価償却費',
    },
    aiCommentary: `## AI財務コメンタリー

### 総合評価
大和建設株式会社は、銀行格付85点（Bランク・正常先）で**良好な財務状態**を維持しています。建設業の中では上位に位置する財務内容です。

### 強み
- **安定した収益**: 売上2.5億円、経常利益率5.4%と建設業として良好
- **健全な財務**: 自己資本比率41%、3期連続黒字の安定経営
- **高い返済能力**: 債務償還年数2.4年で金融機関からの評価も高い

### 課題と対策
1. **季節変動の平準化**: リフォーム事業を強化して閑散期の売上を確保
2. **資材コスト管理**: 主要資材の年間契約で価格変動リスクをヘッジ
3. **業務効率化**: 工事台帳のデジタル化で原価管理を精緻化

### 経営者へのメッセージ
建設業は「受注→施工→回収」のサイクル管理が経営の要です。freeeとの連携で入出金を可視化し、3ヶ月先の資金繰りを常に把握しておくことをお勧めします。`,
    trendMonths: [
      { year: 2025, month: 10, revenue: 22000000, costOfSales: 16500000, grossProfit: 5500000, sgaExpenses: 4200000, operatingIncome: 1300000, ordinaryIncome: 1150000, cashAndDeposits: 22000000, currentAssets: 70000000, currentLiabilities: 46000000, totalAssets: 115000000, netAssets: 47000000 },
      { year: 2025, month: 11, revenue: 19000000, costOfSales: 14200000, grossProfit: 4800000, sgaExpenses: 4200000, operatingIncome: 600000, ordinaryIncome: 450000, cashAndDeposits: 21000000, currentAssets: 71000000, currentLiabilities: 47000000, totalAssets: 116000000, netAssets: 47500000 },
      { year: 2025, month: 12, revenue: 25000000, costOfSales: 18750000, grossProfit: 6250000, sgaExpenses: 4300000, operatingIncome: 1950000, ordinaryIncome: 1800000, cashAndDeposits: 23000000, currentAssets: 73000000, currentLiabilities: 47500000, totalAssets: 118000000, netAssets: 48500000 },
      { year: 2026, month: 1, revenue: 15000000, costOfSales: 11250000, grossProfit: 3750000, sgaExpenses: 4200000, operatingIncome: -450000, ordinaryIncome: -600000, cashAndDeposits: 21500000, currentAssets: 72000000, currentLiabilities: 47500000, totalAssets: 117000000, netAssets: 48000000 },
      { year: 2026, month: 2, revenue: 18000000, costOfSales: 13500000, grossProfit: 4500000, sgaExpenses: 4200000, operatingIncome: 300000, ordinaryIncome: 150000, cashAndDeposits: 22500000, currentAssets: 73000000, currentLiabilities: 48000000, totalAssets: 118000000, netAssets: 48500000 },
      { year: 2026, month: 3, revenue: 28000000, costOfSales: 21000000, grossProfit: 7000000, sgaExpenses: 4300000, operatingIncome: 2700000, ordinaryIncome: 2500000, cashAndDeposits: 25000000, currentAssets: 75000000, currentLiabilities: 48000000, totalAssets: 120000000, netAssets: 50000000 },
    ],
    targets: [
      { year: 2026, month: 4, revenue: 20000000, grossProfit: 5000000, ordinaryIncome: 800000 },
      { year: 2026, month: 5, revenue: 22000000, grossProfit: 5500000, ordinaryIncome: 1000000 },
      { year: 2026, month: 6, revenue: 24000000, grossProfit: 6000000, ordinaryIncome: 1200000 },
      { year: 2026, month: 7, revenue: 18000000, grossProfit: 4500000, ordinaryIncome: 500000 },
      { year: 2026, month: 8, revenue: 16000000, grossProfit: 4000000, ordinaryIncome: 200000 },
      { year: 2026, month: 9, revenue: 23000000, grossProfit: 5750000, ordinaryIncome: 1100000 },
    ],
    chatHistory: [],
    annualKpi: {
      fiscalYear: '2027年3月期',
      targetRevenue: 280000000,
      targetProfit: 18000000,
      targetMargin: 6.4,
      targetEquityRatio: 45,
      targetProductivity: 1870,
      employeeCount: 15,
      customKpis: [
        { id: 'ck-demo-c1', name: '受注件数', target: 80, actual: 62, unit: '件', format: 'number', scope: 'annual' },
        { id: 'ck-demo-c2', name: '工事粗利率', target: 25, actual: 22, unit: '%', format: 'number', scope: 'monthly' },
        { id: 'ck-demo-c3', name: '工期遵守率', target: 95, actual: 88, unit: '%', format: 'number', scope: 'annual' },
        { id: 'ck-demo-c4', name: '平均受注単価', target: 350, actual: 312, unit: '万円', format: 'number', scope: 'annual' },
      ],
    },
  },
];

// ==========================================================================
// 会計AIデモ用プリセット仕訳データ
// ==========================================================================
export const DEMO_JOURNAL_ENTRIES = [
  {
    date: '2026-04-01', debitAccount: '旅費交通費', creditAccount: '現金',
    amount: 12800, taxRate: 10, taxAmount: 1164, description: '東京出張 新幹線往復', partnerName: 'JR東海', receiptType: '領収書',
  },
  {
    date: '2026-04-01', debitAccount: '会議費', creditAccount: '現金',
    amount: 3500, taxRate: 10, taxAmount: 318, description: 'クライアント打合せ カフェ代', partnerName: 'スターバックス', receiptType: 'レシート',
  },
  {
    date: '2026-04-02', debitAccount: '消耗品費', creditAccount: '普通預金',
    amount: 32780, taxRate: 10, taxAmount: 2980, description: 'コピー用紙・トナー', partnerName: 'アスクル', receiptType: '請求書',
  },
  {
    date: '2026-04-03', debitAccount: '通信費', creditAccount: '普通預金',
    amount: 8800, taxRate: 10, taxAmount: 800, description: 'インターネット回線 4月分', partnerName: 'NTT東日本', receiptType: '請求書',
  },
  {
    date: '2026-04-05', debitAccount: '接待交際費', creditAccount: '現金',
    amount: 25000, taxRate: 10, taxAmount: 2273, description: '取引先接待 会食', partnerName: '鮨処 さくら', receiptType: '領収書',
  },
  {
    date: '2026-04-05', debitAccount: '地代家賃', creditAccount: '普通預金',
    amount: 150000, taxRate: 10, taxAmount: 13636, description: '事務所家賃 4月分', partnerName: '三井不動産リアルティ', receiptType: '請求書',
  },
];

export const DEMO_ANALYSIS_RESULT = {
  entries: DEMO_JOURNAL_ENTRIES,
  rawText: '',
  confidence: 'high' as const,
  notes: ['デモデータ: 6件の仕訳を自動生成しました'],
};

export { DEMO_PROFILES };
