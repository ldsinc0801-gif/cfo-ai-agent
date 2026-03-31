/**
 * デモ用データの初期化
 * サーバー起動時にdata/ディレクトリにデモデータがなければ自動生成する
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
const CHAT_DIR = path.join(DATA_DIR, 'chat');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');

export function seedDemoData(): void {
  // ディレクトリ作成
  for (const dir of [DATA_DIR, CHAT_DIR, ANALYSES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // チャット履歴
  const historyPath = path.join(CHAT_DIR, 'conversation-history.json');
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, JSON.stringify(DEMO_CHAT_HISTORY, null, 2));
  }

  // 会社メモリ
  const memoryPath = path.join(CHAT_DIR, 'company-memory.json');
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(memoryPath, JSON.stringify(DEMO_COMPANY_MEMORY, null, 2));
  }

  // 財務分析結果
  const analysisPath = path.join(ANALYSES_DIR, 'analysis-1774600000000-demo01.json');
  if (!fs.existsSync(analysisPath)) {
    fs.writeFileSync(analysisPath, JSON.stringify(DEMO_ANALYSIS, null, 2));
  }
}

const DEMO_COMPANY_MEMORY = {
  companyName: '株式会社フローリッシュ',
  industry: '経営コンサルティング・IT',
  employeeCount: '8人',
  fiscalYearEnd: '3月',
  notes: [
    '中小企業向け財務コンサルティングが主力事業',
    'AI活用による業務改善サービスを展開中',
    '来期は売上1億円突破を目標としている',
  ],
  lastUpdated: '2026-03-31T08:00:00.000Z',
};

const DEMO_CHAT_HISTORY = [
  {
    role: 'user',
    content: 'うちの会社はフローリッシュで、経営コンサルとIT事業をやっています。従業員8人で決算は3月です。',
    timestamp: '2026-03-25T09:00:00.000Z',
  },
  {
    role: 'assistant',
    content: '株式会社フローリッシュ様の情報を記録しました。\n\n- **業種**: 経営コンサルティング・IT\n- **従業員数**: 8名\n- **決算月**: 3月\n\n経営コンサルとIT事業の両輪で展開されているのですね。財務分析や経営相談など、何でもお気軽にご相談ください。',
    timestamp: '2026-03-25T09:00:05.000Z',
  },
  {
    role: 'user',
    content: '今期の決算の見通しを教えて。売上は8,500万くらいになりそう。',
    timestamp: '2026-03-25T09:02:00.000Z',
  },
  {
    role: 'assistant',
    content: '売上8,500万円の見通し、承知しました。直近の財務データをもとに決算見通しを整理します。\n\n## 【今期決算見通し】\n\n### 収益面\n- **売上高**: 約8,500万円\n- **経常利益率**: 直近の分析では約12%を維持\n- **経常利益**: 約1,020万円の見込み\n\n### 財務健全性\n- **自己資本比率**: 42%（前期比+3pt改善）\n- **流動比率**: 185%（短期支払い能力は十分）\n- **手元現預金**: 約1,800万円確保\n\n### 銀行格付への影響\n- **現在のスコア**: 92点/129点（B+ランク）\n- **増収効果**: 売上高スコアが改善する見込み\n- **利益確保**: 黒字継続で収益フロー評価が満点維持\n\n## 【決算に向けた注意点】\n1. **節税対策**: 利益が出すぎる場合は設備投資や研修費を前倒し\n2. **売掛金回収**: 期末までに未回収の売掛金を整理\n3. **経費精算**: 未処理の経費を今月中に計上\n\n来期の目標売上1億円に向けて、良い決算になりそうですね。詳しく見たい項目はありますか？',
    timestamp: '2026-03-25T09:02:10.000Z',
  },
  {
    role: 'user',
    content: '来期の売上1億円を達成するための戦略を考えたい',
    timestamp: '2026-03-26T10:15:00.000Z',
  },
  {
    role: 'assistant',
    content: '売上1億円達成に向けた戦略を整理しましょう。現在の8,500万円から**約18%の成長**が必要です。\n\n## 【売上1億円達成プラン】\n\n### 現状分析\n- **今期売上**: 8,500万円\n- **必要成長額**: +1,500万円\n- **月間目標**: 約833万円/月（現在約708万円/月）\n\n### 戦略1: 既存事業の深堀り（+800万円）\n- **単価アップ**: コンサル案件の月額を5-10%値上げ\n- **契約期間延長**: 単発→年間契約への移行を推進\n- **アップセル**: IT事業とのクロスセルパッケージ提供\n\n### 戦略2: 新規顧客開拓（+500万円）\n- **紹介制度**: 既存顧客からの紹介インセンティブ設計\n- **セミナー開催**: 月1回のオンライン財務セミナーで集客\n- **コンテンツマーケ**: AIを活用した財務診断の無料ツール公開\n\n### 戦略3: 新サービス（+200万円）\n- **AI財務診断サービス**: 月額制の中小企業向けサブスク\n- **企業AI OS導入支援**: パッケージ化して複数社に展開\n\n## 【四半期マイルストーン】\n- **Q1（4-6月）**: 既存顧客の契約更新・単価交渉 → 月780万円\n- **Q2（7-9月）**: セミナー開始・新規3社獲得 → 月830万円\n- **Q3（10-12月）**: AI新サービスリリース → 月870万円\n- **Q4（1-3月）**: 全戦略フル稼働 → 月900万円超\n\n各戦略について、もう少し深掘りしたい部分はありますか？',
    timestamp: '2026-03-26T10:15:15.000Z',
  },
  {
    role: 'user',
    content: '人件費が増えてるんだけど、適正な人件費率ってどのくらい？',
    timestamp: '2026-03-27T14:30:00.000Z',
  },
  {
    role: 'assistant',
    content: '経営コンサル・IT業界の人件費について解説します。\n\n## 【業界別の人件費率の目安】\n\n| 業種 | 売上高人件費率 |\n|------|----------------|\n| **コンサルティング** | 40-55% |\n| **IT・ソフトウェア** | 35-50% |\n| **御社の目安** | 40-50% |\n\n## 【フローリッシュ様の現状】\n- **売上**: 8,500万円\n- **従業員**: 8名\n- **1人あたり売上**: 約1,063万円\n\n### 適正ラインの計算\n- **人件費率45%の場合**: 3,825万円 → 1人あたり478万円\n- **人件費率50%の場合**: 4,250万円 → 1人あたり531万円\n\n## 【判断のポイント】\n\n### 注意が必要なライン\n- **55%超**: 利益を圧迫。採用か単価アップかの判断が必要\n- **60%超**: 危険水域。事業モデルの見直しが必要\n\n### 健全な人件費増の条件\n1. **売上も連動して増加**しているか\n2. **1人あたり生産性**が維持・向上しているか\n3. **粗利率**が下がっていないか\n\n## 【改善アクション】\n- **短期**: AIツールで業務効率化 → 生産性向上\n- **中期**: 1人あたり売上1,200万円を目標に単価交渉\n- **長期**: ストック型収益（月額サブスク）で安定収益確保\n\n直近の月次人件費データがあれば、もっと具体的に分析できます。',
    timestamp: '2026-03-27T14:30:12.000Z',
  },
  {
    role: 'user',
    content: '資金繰りで注意すべきポイントは？来月大きな支払いがある',
    timestamp: '2026-03-28T11:00:00.000Z',
  },
  {
    role: 'assistant',
    content: '大きな支払いを控えているとのこと、資金繰り管理のポイントを整理します。\n\n## 【直近の資金状況】\n- **手元現預金**: 約1,800万円\n- **流動比率**: 185%\n- **月間固定費概算**: 約500-600万円\n\n→ 約3ヶ月分の運転資金は確保されています。\n\n## 【来月の支払いへの対応チェック】\n\n### 1. 支払い前の確認事項\n- 支払い総額の確定\n- 支払い後の残高シミュレーション\n- 同月の入金予定の確認\n- 最低限維持すべき残高（月間固定費の1.5倍 = 約900万円）\n\n### 2. 資金ショートリスクの計算\n```\n現預金 1,800万円\n- 大口支払い: ○○万円\n- 通常固定費: 約550万円\n- 保険的残高: -900万円\n= 余裕額: ○○万円\n```\n\n## 【資金繰り改善の即効策】\n1. **売掛金の早期回収**: 未回収先へ入金催促\n2. **支払いサイト交渉**: 大口支払いの分割相談\n3. **短期借入の準備**: 念のため銀行枠を確認\n\n## 【今後のルール化】\n- **毎月25日**: 翌月の資金繰り表を更新\n- **入金確認**: 売掛先の入金サイクルをリスト化\n- **アラート設定**: 残高900万円を下回ったら要注意\n\n支払い金額がわかれば、具体的なシミュレーションを作りますよ。',
    timestamp: '2026-03-28T11:00:08.000Z',
  },
  {
    role: 'user',
    content: 'ありがとう。今後も毎月の財務レビューを一緒にやっていきたい',
    timestamp: '2026-03-28T11:05:00.000Z',
  },
  {
    role: 'assistant',
    content: 'ぜひ一緒に取り組みましょう！月次財務レビューの仕組みを提案します。\n\n## 【月次財務レビュー体制】\n\n### 毎月のレビュー項目\n1. **月次決算チェック**: PL/BSの前月比・予算比\n2. **銀行格付スコア更新**: 財務指標の推移確認\n3. **資金繰り確認**: 翌月の入出金予定\n4. **KPI進捗**: 売上目標・利益率・人件費率の確認\n5. **改善アクション**: 前月決めたアクションの進捗確認\n\n### 推奨スケジュール\n- **毎月5日頃**: 前月の数字が確定したタイミング\n- **所要時間**: 30分程度\n- **方法**: freeeデータを取り込み → AI分析 → 重要ポイントを確認\n\n### 蓄積する経営データ\n- 月次の分析結果は企業AI OSに自動蓄積\n- 過去の傾向から予測精度が向上\n- 銀行への説明資料としても活用可能\n\nfreeeとの連携が済んでいれば、データ取り込みは自動です。来月からスタートしましょう！',
    timestamp: '2026-03-28T11:05:10.000Z',
  },
];

const DEMO_ANALYSIS = {
  id: 'analysis-1774600000000-demo01',
  createdAt: '2026-03-31T08:00:00.000Z',
  fileName: 'フローリッシュ_決算書_2026年3月期.pdf',
  source: 'upload',
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
      { id: 'gearing_ratio', name: 'ギアリング比率', category: 'stability', value: 57.1, unit: '%', score: 7, maxScore: 10, level: 'good', comment: '借入金は自己資本の範囲内に収まっており健全' },
      { id: 'fixed_long_term_ratio', name: '固定長期適合比率', category: 'stability', value: 45.1, unit: '%', score: 7, maxScore: 7, level: 'excellent', comment: '固定資産を長期資金で十分に賄えている' },
      { id: 'current_ratio', name: '流動比率', category: 'stability', value: 185.3, unit: '%', score: 10, maxScore: 10, level: 'excellent', comment: '短期的な支払能力は十分に確保されている' },
      { id: 'ordinary_profit_margin', name: '売上高経常利益率', category: 'profitability', value: 11.5, unit: '%', score: 7, maxScore: 7, level: 'excellent', comment: '非常に高い利益率を維持しており、収益力が高い' },
      { id: 'roa', name: '総資本経常利益率（ROA）', category: 'profitability', value: 20.2, unit: '%', score: 7, maxScore: 7, level: 'excellent', comment: '資産効率が非常に高く、投下資本に対するリターンが優秀' },
      { id: 'profit_flow', name: '収益フロー', category: 'profitability', value: 3, unit: '期連続', score: 5, maxScore: 5, level: 'excellent', comment: '3期連続黒字で安定した収益基盤を確立' },
      { id: 'ordinary_income_growth', name: '経常利益増加率', category: 'growth', value: 30.7, unit: '%', score: 10, maxScore: 10, level: 'excellent', comment: '前期比30%超の増益で、高い成長力を示している' },
      { id: 'net_assets_amount', name: '自己資本額', category: 'growth', value: 21000000, unit: '円', score: 5, maxScore: 15, level: 'fair', comment: '中小企業として一定の自己資本を確保' },
      { id: 'revenue_amount', name: '売上高', category: 'growth', value: 85000000, unit: '円', score: 3, maxScore: 8, level: 'fair', comment: '事業規模は成長途上だが、着実に拡大中' },
      { id: 'debt_repayment_years', name: '債務償還年数', category: 'repayment', value: 1.5, unit: '年', score: 10, maxScore: 10, level: 'excellent', comment: '借入金を1.5年で返済可能な水準で、返済能力は非常に高い' },
      { id: 'interest_coverage', name: 'インタレストカバレッジレシオ', category: 'repayment', value: 54.4, unit: '倍', score: 10, maxScore: 15, level: 'excellent', comment: '営業利益が支払利息の54倍あり、借入コストの負担は極めて軽い' },
      { id: 'cash_flow', name: 'キャッシュフロー額', category: 'repayment', value: 8060000, unit: '円', score: 4, maxScore: 20, level: 'fair', comment: '中小企業として一定のキャッシュフローを創出' },
    ],
    stabilityScore: 31, stabilityMax: 37,
    profitabilityScore: 19, profitabilityMax: 19,
    growthScore: 18, growthMax: 33,
    repaymentScore: 24, repaymentMax: 45,
    positives: [
      '自己資本比率43%で安定した財務基盤',
      '流動比率185%で短期支払い能力は十分',
      '売上高経常利益率11.5%の高収益体質',
      'ROA 20%超の優秀な資産効率',
      '3期連続黒字の安定した収益力',
      '経常利益30%超の高成長',
      '債務償還年数1.5年の高い返済能力',
      'インタレストカバレッジ54倍の安全な利息負担',
      '借入依存度が低く自己資本中心の経営',
    ],
    negatives: [
      '売上規模は8,500万円でまだ成長余地あり',
      '自己資本額は業界平均と比較して蓄積途上',
    ],
    cautions: [
      '急成長期は運転資金の増加に注意が必要',
      '人件費率の上昇傾向を注視すべき',
    ],
    actions: [
      { title: '売上1億円突破に向けた営業強化', description: '既存顧客のアップセルと新規開拓で月商833万円を目指す', priority: 'high', category: 'growth' },
      { title: '自己資本の積み増し', description: '利益の内部留保を優先し、自己資本1億円を中期目標に設定', priority: 'medium', category: 'stability' },
      { title: '月次財務レビュー体制の構築', description: 'freee連携で毎月の財務データを自動取得し、KPIを定点観測', priority: 'medium', category: 'management' },
    ],
    executiveSummary: [
      '株式会社フローリッシュは銀行格付92点（B+ランク・正常先）と良好な財務状態にあります。',
      '特に収益性（利益率11.5%、ROA 20%）と返済能力（債務償還1.5年）が優秀で、金融機関からの信用力は高い水準です。',
      '来期は売上1億円突破と自己資本の積み増しが成長のカギとなります。',
    ],
    deepDiveQuestions: [
      '来期の設備投資や人材採用の計画はありますか？',
      '主要取引先の集中度はどの程度ですか？',
      'サブスクリプション型の収益モデルへの移行は検討されていますか？',
    ],
  },
  additional: {
    totalAssetTurnover: 1.75,
    totalAssetTurnoverComment: '資産を効率的に活用して売上を創出している',
    simpleCashFlow: 8060000,
    simpleCashFlowComment: '営業活動から約806万円のキャッシュフローを創出',
    simpleCashFlowNote: '簡易CF = 純利益 + 減価償却費',
  },
  aiCommentary: null,
  extractionNotes: [],
};
