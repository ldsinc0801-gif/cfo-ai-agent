import type {
  RatingInput,
  BankRatingResult,
  AdditionalMetrics,
  RatingMetric,
  RatingRank,
  MetricLevel,
  ImprovementAction,
} from '../../types/bank-rating.js';

/**
 * 銀行格付129点満点スコアリングを算出する
 */
export function calculateBankRating(input: RatingInput): BankRatingResult {
  const metrics: RatingMetric[] = [
    calcEquityRatio(input),
    calcGearingRatio(input),
    calcFixedLongTermRatio(input),
    calcCurrentRatio(input),
    calcOrdinaryProfitMargin(input),
    calcROA(input),
    calcProfitFlow(input),
    calcOrdinaryProfitGrowth(input),
    calcNetAssets(input),
    calcRevenue(input),
    calcDebtRepaymentYears(input),
    calcInterestCoverageRatio(input),
    calcCashFlowAmount(input),
  ];

  const totalScore = metrics.reduce((s, m) => s + m.score, 0);

  const stabilityMetrics = metrics.filter(m => m.category === 'stability');
  const profitabilityMetrics = metrics.filter(m => m.category === 'profitability');
  const growthMetrics = metrics.filter(m => m.category === 'growth');
  const repaymentMetrics = metrics.filter(m => m.category === 'repayment');

  // 定量スコアからのランク。ただし銀行実務の「実態評価」を反映してキャップをかける。
  let rank = scoreToRank(totalScore);
  const overrideNotes: string[] = [];
  if (input.netAssets < 0) {
    // 実質債務超過先は原則「要注意先」以下。直近も経常赤字なら「破綻懸念先」相当。
    // 有効な経営改善計画があれば要管理先(要注意先)に留まりうるが、本ツールは保守的に評価する。
    const cap = input.ordinaryIncome < 0 ? 'E' : 'D';
    const capped = applyRankCap(rank, cap);
    if (capped.rank !== rank.rank) {
      overrideNotes.push(
        input.ordinaryIncome < 0
          ? `債務超過かつ経常赤字のため、定量スコア(${totalScore}点)に関わらず「破綻懸念先」相当に評価しました（実態評価）。`
          : `債務超過のため、定量スコア(${totalScore}点)に関わらず「要注意先」以下に評価しました（実態評価）。`,
      );
      rank = capped;
    }
  }

  return {
    totalScore,
    maxScore: 129,
    rank: rank.rank,
    rankLabel: rank.label,
    metrics,
    stabilityScore: sum(stabilityMetrics),
    stabilityMax: sumMax(stabilityMetrics),
    profitabilityScore: sum(profitabilityMetrics),
    profitabilityMax: sumMax(profitabilityMetrics),
    growthScore: sum(growthMetrics),
    growthMax: sumMax(growthMetrics),
    repaymentScore: sum(repaymentMetrics),
    repaymentMax: sumMax(repaymentMetrics),
    positives: generatePositives(metrics),
    negatives: generateNegatives(metrics),
    cautions: [...overrideNotes, ...generateCautions(metrics)],
    actions: generateActions(metrics, input),
    executiveSummary: generateSummary(totalScore, rank.label, metrics, input),
    deepDiveQuestions: generateQuestions(metrics, input),
  };
}

/**
 * 追加指標（格付に含めない独立ブロック）
 */
export function calculateAdditionalMetrics(input: RatingInput): AdditionalMetrics {
  // 総資本回転率
  const avgTotalAssets = input.prevTotalAssets
    ? (input.totalAssets + input.prevTotalAssets) / 2
    : input.totalAssets;
  const turnover = avgTotalAssets > 0 ? input.revenue / avgTotalAssets : null;
  const turnoverComment = turnover !== null
    ? turnover >= 1.5 ? '資産効率は良好です。売上に対して資産を有効活用しています。'
      : turnover >= 1.0 ? '資産効率は標準的な水準です。'
      : '資産効率がやや低い状態です。遊休資産や過大な運転資金がないか確認が必要です。'
    : '算出不可';

  // 簡易CF
  let simpleCF: number | null = null;
  let simpleCFComment = '';
  let simpleCFNote = '';

  if (input.annualDebtRepayment !== null) {
    simpleCF = input.netIncome + input.depreciation - input.annualDebtRepayment;
    simpleCFNote = '返済元本は入力値を使用';
  } else if (input.prevTotalAssets !== null) {
    // 借入残高差額で概算
    const estimatedRepayment = Math.max(0, input.interestBearingDebt - (input.interestBearingDebt * 0.9));
    simpleCF = input.netIncome + input.depreciation - estimatedRepayment;
    simpleCFNote = '※返済元本は推定値（前年借入残高差額ベース）';
  } else {
    simpleCFNote = '返済元本データがないため算出不可';
  }

  if (simpleCF !== null) {
    simpleCFComment = simpleCF > 0
      ? `簡易CFは${fmt(simpleCF)}のプラスです。返済後にも手元に現金が残る状態で、財務余力があります。`
      : `簡易CFは${fmt(simpleCF)}のマイナスです。返済が利益を上回っており、資金繰りに注意が必要です。`;
  }

  return {
    totalAssetTurnover: turnover,
    totalAssetTurnoverComment: turnoverComment,
    simpleCashFlow: simpleCF,
    simpleCashFlowComment: simpleCFComment,
    simpleCashFlowNote: simpleCFNote,
  };
}

// =========================================================================
// 個別指標の計算（13指標）
// =========================================================================

function calcEquityRatio(input: RatingInput): RatingMetric {
  const value = input.totalAssets > 0 ? (input.netAssets / input.totalAssets) * 100 : 0;
  const { score, level } = scoreEquityRatio(value);
  return {
    id: 'equity_ratio', name: '自己資本比率', category: 'stability',
    value, unit: '%', score, maxScore: 10, level,
    comment: value >= 40 ? '自己資本が厚く、長期的な財務安定性が高い' :
             value >= 20 ? '標準的な水準。さらなる内部留保の積み上げが望ましい' :
             '自己資本が薄く、借入依存度が高い状態',
  };
}

function calcGearingRatio(input: RatingInput): RatingMetric {
  const value = input.netAssets > 0 ? (input.interestBearingDebt / input.netAssets) * 100 : 999;
  const { score, level } = scoreGearingRatio(value);
  return {
    id: 'gearing_ratio', name: 'ギアリング比率', category: 'stability',
    value, unit: '%', score, maxScore: 10, level,
    comment: value <= 50 ? '有利子負債が自己資本に対して少なく、財務レバレッジは低い' :
             value <= 100 ? '借入と自己資本のバランスは許容範囲内' :
             '有利子負債が自己資本を上回っており、借入依存が高い',
  };
}

function calcFixedLongTermRatio(input: RatingInput): RatingMetric {
  const denominator = input.netAssets + input.fixedLiabilities;
  const value = denominator > 0 ? (input.fixedAssets / denominator) * 100 : 999;
  const { score, level } = scoreFixedLongTermRatio(value);
  return {
    id: 'fixed_long_term_ratio', name: '固定長期適合比率', category: 'stability',
    value, unit: '%', score, maxScore: 7, level,
    comment: value <= 80 ? '固定資産を長期資金で十分に賄えている' :
             value <= 100 ? '固定資産が長期資金にほぼ見合っている' :
             '固定資産を短期資金で賄っている懸念がある',
  };
}

function calcCurrentRatio(input: RatingInput): RatingMetric {
  const value = input.currentLiabilities > 0 ? (input.currentAssets / input.currentLiabilities) * 100 : 0;
  const { score, level } = scoreCurrentRatio(value);
  return {
    id: 'current_ratio', name: '流動比率', category: 'stability',
    value, unit: '%', score, maxScore: 10, level,
    comment: value >= 200 ? '短期的な支払能力は十分に確保されている' :
             value >= 120 ? '短期的な支払能力は良好' :
             '短期的な資金繰りに注意が必要',
  };
}

function calcOrdinaryProfitMargin(input: RatingInput): RatingMetric {
  const value = input.revenue > 0 ? (input.ordinaryIncome / input.revenue) * 100 : 0;
  const { score, level } = scoreProfitMargin(value);
  return {
    id: 'ordinary_profit_margin', name: '売上高経常利益率', category: 'profitability',
    value, unit: '%', score, maxScore: 7, level,
    comment: value >= 10 ? '本業の収益力が非常に高い' :
             value >= 5 ? '標準的な収益力を維持している' :
             value >= 0 ? '収益力が低い。費用構造の見直しが必要' :
             '赤字の状態。早急な収益改善が必要',
  };
}

function calcROA(input: RatingInput): RatingMetric {
  const value = input.totalAssets > 0 ? (input.ordinaryIncome / input.totalAssets) * 100 : 0;
  const { score, level } = scoreROA(value);
  return {
    id: 'roa', name: '総資本経常利益率（ROA）', category: 'profitability',
    value, unit: '%', score, maxScore: 7, level,
    comment: value >= 10 ? '資産を非常に効率よく活用し利益を生んでいる' :
             value >= 5 ? '資産活用効率は良好' :
             '資産に対する収益力が低い',
  };
}

function calcProfitFlow(input: RatingInput): RatingMetric {
  const history = input.profitFlowHistory;
  const negCount = history.filter(h => h === 'negative').length;
  const value = negCount;
  const { score, level } = scoreProfitFlow(history);
  return {
    id: 'profit_flow', name: '収益フロー', category: 'profitability',
    value: null, unit: '', score, maxScore: 5, level,
    comment: negCount === 0 ? '直近3期すべて黒字で安定した収益基盤' :
             negCount === 1 ? '一時的な赤字があるが回復傾向にある可能性' :
             negCount >= 3 ? '3期連続赤字は致命的。抜本的な事業見直しが必要' :
             '赤字が複数期あり、収益の安定性に課題',
  };
}

function calcOrdinaryProfitGrowth(input: RatingInput): RatingMetric {
  let value: number | null = null;
  if (input.prevOrdinaryIncome !== null && input.prevOrdinaryIncome !== 0) {
    value = (input.ordinaryIncome / Math.abs(input.prevOrdinaryIncome)) * 100;
  }
  const { score, level } = scoreGrowthRate(value);
  return {
    id: 'ordinary_profit_growth', name: '経常利益増加率', category: 'growth',
    value, unit: '%', score, maxScore: 10, level,
    comment: value === null ? '前期データがないため評価不可' :
             value >= 120 ? '高い成長率を示しており、事業拡大期にある' :
             value >= 105 ? '堅調な成長を維持している' :
             value >= 100 ? '横ばい。成長の踊り場の可能性' :
             '減益傾向。原因分析と対策が必要',
  };
}

function calcNetAssets(input: RatingInput): RatingMetric {
  const value = input.netAssets;
  const { score, level } = scoreNetAssets(value);
  return {
    id: 'net_assets', name: '自己資本額', category: 'growth',
    value, unit: '円', score, maxScore: 15, level,
    comment: value >= 100_000_000 ? '厚い自己資本を持ち、企業体力がある' :
             value >= 30_000_000 ? '中小企業として標準的な自己資本' :
             value > 0 ? '自己資本が薄く、資本増強が望ましい' :
             '債務超過の状態。至急の改善が必要',
  };
}

function calcRevenue(input: RatingInput): RatingMetric {
  const value = input.revenue;
  const { score, level } = scoreRevenue(value);
  return {
    id: 'revenue', name: '売上高', category: 'growth',
    value, unit: '円', score, maxScore: 8, level,
    comment: value >= 500_000_000 ? '一定の市場規模・地位を確保している' :
             value >= 100_000_000 ? '中小企業として標準的な売上規模' :
             '売上規模が小さく、事業基盤の拡大が課題',
  };
}

function calcDebtRepaymentYears(input: RatingInput): RatingMetric {
  const cf = input.operatingIncome + input.depreciation;
  const value = cf > 0 ? input.interestBearingDebt / cf : null;
  const { score, level } = scoreDebtYears(value);
  return {
    id: 'debt_repayment_years', name: '債務償還年数', category: 'repayment',
    value, unit: '年', score, maxScore: 10, level,
    comment: value === null ? '営業CFがマイナスのため算出不可' :
             value <= 5 ? '借入金を短期間で返済可能な財務力がある' :
             value <= 10 ? '返済計画の範囲内。ただし注視が必要' :
             '返済に長期間を要し、借入過多の懸念がある',
  };
}

function calcInterestCoverageRatio(input: RatingInput): RatingMetric {
  const numerator = input.operatingIncome + input.interestIncome;
  // 有利子負債があるのに支払利息が0＝データ欠落。満点(良好)にせず、算定不可として0点にする。
  const missingInterest = input.interestExpense <= 0 && input.interestBearingDebt > 0;
  const value = input.interestExpense > 0 ? numerator / input.interestExpense : null;
  let score: number;
  let level: MetricLevel;
  if (missingInterest) {
    score = 0; level = 'warning';
  } else {
    ({ score, level } = scoreICR(value));
  }
  return {
    id: 'interest_coverage', name: 'インタレストカバレッジレシオ', category: 'repayment',
    value, unit: '倍', score, maxScore: 15, level,
    comment: missingInterest ? '有利子負債があるのに支払利息が未取得のため算定不可（決算書の取込を確認してください）' :
             value === null ? '有利子負債が無く利息負担なし（良好）' :
             value >= 10 ? '利息支払能力は極めて高い' :
             value >= 3 ? '利息支払に十分な利益を確保している' :
             value >= 1 ? '利息支払がギリギリの水準' :
             '利息を利益で賄えていない危険な状態',
  };
}

function calcCashFlowAmount(input: RatingInput): RatingMetric {
  const value = input.operatingIncome + input.depreciation;
  const { score, level } = scoreCashFlowAmount(value);
  return {
    id: 'cashflow_amount', name: 'キャッシュフロー額', category: 'repayment',
    value, unit: '円', score, maxScore: 20, level,
    comment: value > 0 ? `営業CFは${fmt(value)}。事業から現金を生み出す力がある` :
             '営業CFがマイナス。事業が現金を消費している状態',
  };
}

// =========================================================================
// スコアリング関数
// =========================================================================

function scoreEquityRatio(v: number): { score: number; level: MetricLevel } {
  if (v >= 60) return { score: 10, level: 'excellent' };
  if (v >= 40) return { score: 8, level: 'good' };
  if (v >= 20) return { score: 6, level: 'fair' };
  if (v >= 10) return { score: 3, level: 'warning' };
  return { score: 1, level: 'danger' };
}

function scoreGearingRatio(v: number): { score: number; level: MetricLevel } {
  if (v <= 30) return { score: 10, level: 'excellent' };
  if (v <= 50) return { score: 8, level: 'good' };
  if (v <= 100) return { score: 6, level: 'fair' };
  if (v <= 250) return { score: 3, level: 'warning' };
  return { score: 1, level: 'danger' };
}

function scoreFixedLongTermRatio(v: number): { score: number; level: MetricLevel } {
  if (v <= 60) return { score: 7, level: 'excellent' };
  if (v <= 80) return { score: 6, level: 'good' };
  if (v <= 100) return { score: 4, level: 'fair' };
  if (v <= 120) return { score: 2, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreCurrentRatio(v: number): { score: number; level: MetricLevel } {
  if (v >= 200) return { score: 10, level: 'excellent' };
  if (v >= 150) return { score: 8, level: 'good' };
  if (v >= 120) return { score: 6, level: 'fair' };
  if (v >= 80) return { score: 3, level: 'warning' };
  return { score: 1, level: 'danger' };
}

function scoreProfitMargin(v: number): { score: number; level: MetricLevel } {
  if (v >= 10) return { score: 7, level: 'excellent' };
  if (v >= 5) return { score: 5, level: 'good' };
  if (v >= 2) return { score: 3, level: 'fair' };
  if (v >= 0) return { score: 1, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreROA(v: number): { score: number; level: MetricLevel } {
  if (v >= 10) return { score: 7, level: 'excellent' };
  if (v >= 5) return { score: 5, level: 'good' };
  if (v >= 2) return { score: 3, level: 'fair' };
  if (v >= 0) return { score: 1, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreProfitFlow(history: ('positive' | 'negative' | 'zero')[]): { score: number; level: MetricLevel } {
  const negCount = history.filter(h => h === 'negative').length;
  if (negCount === 0) return { score: 5, level: 'excellent' };
  if (negCount === 1) return { score: 3, level: 'fair' };
  if (negCount === 2) return { score: 1, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreGrowthRate(v: number | null): { score: number; level: MetricLevel } {
  // 前期実績が無く成長性を評価できない場合は加点しない（銀行は評価不能分を加点しない）
  if (v === null) return { score: 0, level: 'warning' };
  if (v >= 130) return { score: 10, level: 'excellent' };
  if (v >= 110) return { score: 8, level: 'good' };
  if (v >= 105) return { score: 6, level: 'fair' };
  if (v >= 100) return { score: 4, level: 'fair' };
  if (v >= 80) return { score: 2, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreNetAssets(v: number): { score: number; level: MetricLevel } {
  if (v >= 500_000_000) return { score: 15, level: 'excellent' };
  if (v >= 100_000_000) return { score: 12, level: 'good' };
  if (v >= 30_000_000) return { score: 9, level: 'good' };
  if (v >= 10_000_000) return { score: 6, level: 'fair' };
  if (v > 0) return { score: 3, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreRevenue(v: number): { score: number; level: MetricLevel } {
  if (v >= 1_000_000_000) return { score: 8, level: 'excellent' };
  if (v >= 500_000_000) return { score: 7, level: 'good' };
  if (v >= 100_000_000) return { score: 5, level: 'good' };
  if (v >= 50_000_000) return { score: 3, level: 'fair' };
  return { score: 1, level: 'warning' };
}

function scoreDebtYears(v: number | null): { score: number; level: MetricLevel } {
  if (v === null) return { score: 0, level: 'danger' };
  if (v <= 3) return { score: 10, level: 'excellent' };
  if (v <= 5) return { score: 8, level: 'good' };
  if (v <= 10) return { score: 5, level: 'fair' };
  if (v <= 20) return { score: 2, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreICR(v: number | null): { score: number; level: MetricLevel } {
  if (v === null) return { score: 15, level: 'excellent' }; // 支払利息なし
  if (v >= 20) return { score: 15, level: 'excellent' };
  if (v >= 10) return { score: 12, level: 'good' };
  if (v >= 5) return { score: 9, level: 'good' };
  if (v >= 3) return { score: 6, level: 'fair' };
  if (v >= 1) return { score: 3, level: 'warning' };
  return { score: 0, level: 'danger' };
}

function scoreCashFlowAmount(v: number): { score: number; level: MetricLevel } {
  if (v >= 50_000_000) return { score: 20, level: 'excellent' };
  if (v >= 20_000_000) return { score: 16, level: 'good' };
  if (v >= 10_000_000) return { score: 12, level: 'good' };
  if (v >= 5_000_000) return { score: 8, level: 'fair' };
  if (v > 0) return { score: 4, level: 'warning' };
  return { score: 0, level: 'danger' };
}

// =========================================================================
// ランク判定
// =========================================================================

/** ランクの序列（良い順）。キャップ適用に使う。 */
const RANK_ORDER: RatingRank[] = ['A', 'B', 'C', 'D', 'E'];
const RANK_LABELS: Record<RatingRank, string> = {
  A: '優良（正常先）', B: '良好（正常先）', C: '普通（要注意先予備）',
  D: '要注意（要管理先）', E: '危険（破綻懸念先）',
};

/** rank を cap より良くならないように制限する（例: cap='E' なら必ずE）。 */
function applyRankCap(rank: { rank: RatingRank; label: string }, cap: RatingRank): { rank: RatingRank; label: string } {
  const capped = Math.max(RANK_ORDER.indexOf(rank.rank), RANK_ORDER.indexOf(cap));
  const r = RANK_ORDER[capped];
  return { rank: r, label: RANK_LABELS[r] };
}

function scoreToRank(total: number): { rank: RatingRank; label: string } {
  if (total >= 100) return { rank: 'A', label: '優良（正常先）' };
  if (total >= 80) return { rank: 'B', label: '良好（正常先）' };
  if (total >= 60) return { rank: 'C', label: '普通（要注意先予備）' };
  if (total >= 40) return { rank: 'D', label: '要注意（要管理先）' };
  return { rank: 'E', label: '危険（破綻懸念先）' };
}

// =========================================================================
// コメント生成
// =========================================================================

function generatePositives(metrics: RatingMetric[]): string[] {
  return metrics
    .filter(m => m.level === 'excellent' || m.level === 'good')
    .map(m => `${m.name}：${m.comment}`);
}

function generateNegatives(metrics: RatingMetric[]): string[] {
  return metrics
    .filter(m => m.level === 'danger')
    .map(m => `${m.name}：${m.comment}`);
}

function generateCautions(metrics: RatingMetric[]): string[] {
  return metrics
    .filter(m => m.level === 'warning')
    .map(m => `${m.name}：${m.comment}`);
}

function generateActions(metrics: RatingMetric[], input: RatingInput): ImprovementAction[] {
  const actions: ImprovementAction[] = [];
  const weak = metrics.filter(m => m.level === 'danger' || m.level === 'warning');

  for (const m of weak) {
    switch (m.id) {
      case 'equity_ratio':
        actions.push({ priority: 'high', content: '内部留保の積み上げまたは増資による自己資本の充実', effect: '自己資本比率の改善、借入依存度の低下', timeframe: '1〜3年' });
        break;
      case 'gearing_ratio':
        actions.push({ priority: 'high', content: '有利子負債の圧縮（繰上返済・新規借入の抑制）', effect: 'ギアリング比率の改善、金利負担の軽減', timeframe: '1〜2年' });
        break;
      case 'current_ratio':
        actions.push({ priority: 'high', content: '運転資金の確保（売掛金回収サイト短縮、在庫圧縮）', effect: '流動比率の改善、短期資金繰りの安定化', timeframe: '3〜6か月' });
        break;
      case 'ordinary_profit_margin':
      case 'roa':
        actions.push({ priority: 'high', content: '収益構造の見直し（原価低減、不採算事業の整理）', effect: '利益率の改善', timeframe: '6か月〜1年' });
        break;
      case 'debt_repayment_years':
        actions.push({ priority: 'medium', content: '借入金の返済計画見直し・リファイナンス検討', effect: '債務償還年数の短縮', timeframe: '6か月〜1年' });
        break;
      case 'cashflow_amount':
        actions.push({ priority: 'high', content: '営業CFの改善（固定費削減、売上増加策）', effect: 'キャッシュフロー創出力の向上', timeframe: '3〜12か月' });
        break;
      case 'profit_flow':
        actions.push({ priority: 'high', content: '赤字脱却に向けた事業計画の策定と実行', effect: '収益の黒字化・安定化', timeframe: '6か月〜1年' });
        break;
    }
  }

  if (actions.length === 0) {
    actions.push({ priority: 'low', content: '現状の財務体質を維持しつつ、成長投資を検討', effect: '持続的成長', timeframe: '随時' });
  }

  return actions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

function generateSummary(total: number, rankLabel: string, metrics: RatingMetric[], input: RatingInput): string[] {
  const lines: string[] = [];
  lines.push(`銀行格付スコアは${total}点/129点満点で、「${rankLabel}」に相当します。`);

  const dangers = metrics.filter(m => m.level === 'danger');
  const excellents = metrics.filter(m => m.level === 'excellent');

  if (dangers.length > 0) {
    lines.push(`特に${dangers.map(m => m.name).join('・')}が課題であり、早急な改善が必要です。`);
  } else if (excellents.length >= 5) {
    lines.push('全体的に良好な財務状態を維持しており、融資条件の改善交渉も可能な水準です。');
  } else {
    lines.push('大きな問題はありませんが、個別指標の改善余地があります。');
  }

  return lines;
}

function generateQuestions(metrics: RatingMetric[], input: RatingInput): string[] {
  const questions: string[] = [];

  if (input.interestBearingDebt > input.netAssets) {
    questions.push('有利子負債が自己資本を上回っていますが、今後の返済計画はどのようになっていますか？');
  }
  if (input.ordinaryIncome < 0) {
    questions.push('経常赤字の主な要因は何ですか？いつまでに黒字化を見込んでいますか？');
  }
  if (input.annualDebtRepayment === null) {
    questions.push('年間の借入返済元本額を教えてください。簡易CFの正確な算出に必要です。');
  }

  if (questions.length < 3) {
    questions.push('今後1年間の設備投資計画はありますか？');
  }
  if (questions.length < 3) {
    questions.push('主要取引先の売上集中度はどの程度ですか？');
  }
  if (questions.length < 3) {
    questions.push('翌期の売上・利益の見通しはどのようにお考えですか？');
  }

  return questions.slice(0, 3);
}

// =========================================================================
// Utility
// =========================================================================

function sum(metrics: RatingMetric[]): number {
  return metrics.reduce((s, m) => s + m.score, 0);
}
function sumMax(metrics: RatingMetric[]): number {
  return metrics.reduce((s, m) => s + m.maxScore, 0);
}
function fmt(v: number): string {
  return new Intl.NumberFormat('ja-JP').format(Math.round(v)) + '円';
}
