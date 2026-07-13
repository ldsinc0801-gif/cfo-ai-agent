// TODO: Rename this file to reflect its actual content (Gemini-based).
// Consider renaming to financial-analysis-service.ts in a future refactor.

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import type { RatingInput } from '../types/bank-rating.js';

/**
 * Gemini APIを使った財務分析サービス（Vertex AI経由）
 *
 * PDF/CSVから抽出したテキストや、freeeの数値データを
 * Gemini APIに渡して分析・解釈を行う。
 * 画像・PDF・動画のマルチモーダル入力に対応。
 */
export class AnthropicAnalysisService {
  private ai: any = null;

  constructor() {
    const project = config.ai.gcpProject;
    if (project) {
      import('@google/genai').then(({ GoogleGenAI }) => {
        this.ai = new GoogleGenAI({ vertexai: true, project, location: config.ai.geminiRegion });
        logger.info('Gemini API分析クライアント (Vertex AI) を初期化しました');
      }).catch(e => logger.error('Gemini SDK初期化失敗:', e));
    } else {
      logger.warn('GOOGLE_CLOUD_PROJECTが未設定です。AI分析機能は利用できません。');
    }
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  async extractFinancialData(documentText: string, fileName: string): Promise<{
    ratingInput: RatingInput;
    extractionNotes: string[];
    rawResponse: string;
  }> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません。GOOGLE_CLOUD_PROJECTを確認してください。');

    const prompt = `あなたは財務データ抽出の専門家です。
以下の決算書データから、銀行格付に必要な財務数値を抽出してJSON形式で返してください。

【重要なルール】
- 数値は全て円単位（整数）で返してください
- 見つからない項目はnullとしてください
- 推定した場合は extractionNotes に記載してください
- 有利子負債は「短期借入金+長期借入金+社債」の合計です
- 減価償却費がPLに明示されていない場合、販管費明細やCF計算書から探してください

【抽出対象】
{
  "totalAssets": 総資産,
  "currentAssets": 流動資産,
  "fixedAssets": 固定資産,
  "currentLiabilities": 流動負債,
  "fixedLiabilities": 固定負債,
  "netAssets": 純資産,
  "interestBearingDebt": 有利子負債,
  "cashAndDeposits": 現金預金,
  "revenue": 売上高,
  "operatingIncome": 営業利益,
  "ordinaryIncome": 経常利益,
  "netIncome": 当期純利益,
  "interestExpense": 支払利息,
  "interestIncome": 受取利息配当金,
  "depreciation": 減価償却費,
  "prevOrdinaryIncome": 前期経常利益（あれば）,
  "prevTotalAssets": 前期総資産（あれば）,
  "annualDebtRepayment": 年間返済元本（あれば）,
  "extractionNotes": ["抽出時の注意点や推定した項目"]
}

【決算書データ】
ファイル名: ${fileName}

${documentText}

JSONのみを返してください。説明文は不要です。`;

    logger.info(`Gemini APIで財務データを抽出中... (${fileName})`);

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
    });
    const text = response.text || '';
    this.recordUsage(response, '財務データ抽出(Gemini)');
    logger.info('Gemini APIからレスポンスを受信しました');

    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : text;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AIからの応答から財務データを解析できませんでした');

    const parsed = JSON.parse(jsonMatch[0]);
    const notes: string[] = parsed.extractionNotes || [];

    const ratingInput: RatingInput = {
      totalAssets: parsed.totalAssets ?? 0,
      currentAssets: parsed.currentAssets ?? 0,
      fixedAssets: parsed.fixedAssets ?? 0,
      currentLiabilities: parsed.currentLiabilities ?? 0,
      fixedLiabilities: parsed.fixedLiabilities ?? 0,
      netAssets: parsed.netAssets ?? 0,
      interestBearingDebt: parsed.interestBearingDebt ?? 0,
      cashAndDeposits: parsed.cashAndDeposits ?? 0,
      revenue: parsed.revenue ?? 0,
      operatingIncome: parsed.operatingIncome ?? 0,
      ordinaryIncome: parsed.ordinaryIncome ?? 0,
      netIncome: parsed.netIncome ?? 0,
      interestExpense: parsed.interestExpense ?? 0,
      interestIncome: parsed.interestIncome ?? 0,
      depreciation: parsed.depreciation ?? 0,
      prevOrdinaryIncome: parsed.prevOrdinaryIncome ?? null,
      prevTotalAssets: parsed.prevTotalAssets ?? null,
      annualDebtRepayment: parsed.annualDebtRepayment ?? null,
      profitFlowHistory: parsed.ordinaryIncome > 0
        ? ['positive', 'positive', 'positive']
        : ['negative', 'positive', 'positive'],
    };

    return { ratingInput, extractionNotes: notes, rawResponse: text };
  }

  async generateAnalysisCommentary(ratingJson: string, additionalJson: string): Promise<string> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません');

    const prompt = `あなたは中小企業専門の財務コンサルタントです。
以下の銀行格付分析結果をもとに、経営者向けの構造化された分析レポートをJSON形式で生成してください。

【文体ルール】
- 専門用語を使いすぎず、ただし会計的に不正確な表現は避ける
- 数字の羅列ではなく、何を意味するのかを説明する
- 「財務コンサルタントが経営者へ報告する文体」
- 誇張しない、データ不足時は「判断保留」と明記

【格付分析結果】
${ratingJson}

【追加指標】
${additionalJson}

以下のJSON形式で出力してください。JSONのみ返してください。

{
  "headline": "一言で表す総合判定（15文字以内）",
  "summary": "経営者が最初に読む3行の総評文",
  "overallGrade": "A〜Eの格付",
  "strengths": [{"title": "強みの名称", "detail": "具体的な説明", "icon": "絵文字1つ"}],
  "weaknesses": [{"title": "弱みの名称", "detail": "具体的な説明", "icon": "絵文字1つ"}],
  "bankView": {"overallComment": "銀行目線の総合コメント", "positives": [], "concerns": [], "lendingImpact": "融資への影響"},
  "keyMetrics": [{"name": "指標名", "value": "値", "benchmark": "基準値", "assessment": "excellent/good/fair/warning/danger", "comment": "一言"}],
  "immediateActions": [{"priority": 1, "action": "施策", "reason": "理由", "expectedEffect": "効果", "timeframe": "期間"}],
  "mediumTermStrategy": [{"theme": "テーマ", "detail": "施策", "timeframe": "期間"}],
  "riskAlerts": [{"level": "high/medium/low", "title": "リスク名", "detail": "詳細"}],
  "industryComparison": {"position": "ポジション", "aboveAverage": [], "belowAverage": []}
}`;

    logger.info('Gemini APIで分析コメントを生成中...');
    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
    });
    const text = response.text || '';
    this.recordUsage(response, 'AI分析コメント生成(Gemini)');
    logger.info('AI分析コメント生成完了');
    return text;
  }

  /**
   * 単月試算表 or 年度決算書から PL/BS スナップショットを1件抽出する。
   * 月次推移ではなく「ある時点」の数値として保存する。
   */
  async extractMonthlySnapshot(documentText: string, fileName: string): Promise<{
    snapshot: import('../types/trend.js').MonthlySnapshot;
    extractionNotes: string[];
  }> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません');

    const today = new Date();
    const prompt = `以下の試算表または決算書から、PL/BS の主要科目を抽出してJSON形式で返してください。

【ルール】
- 数値は円単位の整数。不明な項目は null。
- **最重要**: 「月別推移」「推移表」など複数月（例: 6月度〜4月度）が横に並ぶ表の場合、必ず**右端の「期間残高」「期末残高」「合計」列**の値を採用する（＝会計期間の年間/期末の確定値）。**特定の月（例: 12月度）の列を年間値として使ってはならない**。「決算仕訳合計」列は期間残高に含まれるので単独では使わない。
- year/month は会計期間の**期末年月**（月別推移なら最後の月度＝期末。不明なら ${today.getFullYear()}/${today.getMonth() + 1}）。12月を期末と決めつけない。
- 売上総利益が無ければ 売上高 - 売上原価 で計算。
- 経常利益が無ければ営業利益で代用。
- PLの利益（営業利益・経常利益・当期純利益）と純資産は、赤字・債務超過ならマイナスのまま採用してよい。
- 売上高・売上原価・販管費・各資産・有利子負債は0以上の正の数（これらがマイナスなら符号の取り違えなので見直す）。
- 有利子負債は BS の「短期借入金＋長期借入金＋社債＋リース債務」等の合計。借入があるのに0にしない。
- 決算書BSに「前期／当期」の2列がある場合、当期列＝期末を interestBearingDebt に、前期列＝期首を openingInterestBearingDebt に入れる。前期列が無ければ openingInterestBearingDebt は null。

【出力JSON】
{
  "year": 2026, "month": 3,
  "revenue": 売上高,
  "costOfSales": 売上原価,
  "grossProfit": 売上総利益,
  "sgaExpenses": 販管費,
  "operatingIncome": 営業利益,
  "ordinaryIncome": 経常利益,
  "cashAndDeposits": 現金預金,
  "currentAssets": 流動資産,
  "currentLiabilities": 流動負債,
  "totalAssets": 総資産,
  "netAssets": 純資産,
  "interestBearingDebt": 有利子負債（当期＝期末。短期借入金＋長期借入金＋社債等。無ければ0）,
  "openingInterestBearingDebt": 前期末＝期首の有利子負債（BSの前期列。無ければnull）,
  "accountsReceivable": 売上債権＝受取手形＋売掛金＋電子記録債権（無ければnull）,
  "inventory": 棚卸資産＝商品＋製品＋仕掛品＋原材料＋貯蔵品（無ければnull）,
  "accountsPayable": 仕入債務＝支払手形＋買掛金＋電子記録債務（無ければnull）,
  "netIncome": 当期純利益,
  "depreciation": 減価償却費,
  "interestExpense": 支払利息,
  "extractionNotes": ["注意点や推定箇所"]
}

【資料】
ファイル名: ${fileName}
${documentText}

JSONのみ返してください。`;

    logger.info(`単月スナップショット抽出中（Gemini）: ${fileName}`);
    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
    });
    const text = response.text || '';
    this.recordUsage(response, '単月試算表抽出(Gemini)');

    const jsonStr = (text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || text);
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AIからの応答からJSONを解析できませんでした');

    const p = JSON.parse(jsonMatch[0]);
    const snapshot = {
      year: p.year ?? today.getFullYear(),
      month: p.month ?? today.getMonth() + 1,
      revenue: p.revenue ?? 0,
      costOfSales: p.costOfSales ?? 0,
      grossProfit: p.grossProfit ?? ((p.revenue ?? 0) - (p.costOfSales ?? 0)),
      sgaExpenses: p.sgaExpenses ?? 0,
      operatingIncome: p.operatingIncome ?? 0,
      ordinaryIncome: p.ordinaryIncome ?? p.operatingIncome ?? 0,
      cashAndDeposits: p.cashAndDeposits ?? 0,
      currentAssets: p.currentAssets ?? 0,
      currentLiabilities: p.currentLiabilities ?? 0,
      totalAssets: p.totalAssets ?? 0,
      netAssets: p.netAssets ?? 0,
      interestBearingDebt: p.interestBearingDebt ?? 0,
      openingInterestBearingDebt: p.openingInterestBearingDebt ?? null,
      accountsReceivable: p.accountsReceivable ?? null,
      inventory: p.inventory ?? null,
      accountsPayable: p.accountsPayable ?? null,
      netIncome: p.netIncome ?? 0,
      depreciation: p.depreciation ?? 0,
      interestExpense: p.interestExpense ?? 0,
    };
    const notes: string[] = Array.isArray(p.extractionNotes) ? p.extractionNotes : [];
    // 明らかに不正な値を警告（自動補正はせず、確認・修正を促す）
    if (snapshot.revenue < 0) notes.push('⚠ 売上高がマイナスで抽出されました。確認・修正画面で見直してください。');
    if (snapshot.costOfSales < 0) notes.push('⚠ 売上原価がマイナスで抽出されました。見直してください。');
    if (snapshot.netAssets < 0) notes.push('⚠ 純資産がマイナス（債務超過）で抽出されました。実態と異なる場合は修正してください。');
    if (snapshot.totalAssets <= 0) notes.push('⚠ 総資産が0以下で抽出されました。確認してください。');
    return { snapshot, extractionNotes: notes };
  }

  /**
   * 月次推移試算表から複数月分のPL/BSを抽出する。
   */
  async extractMonthlyTrend(documentText: string, fileName: string): Promise<{
    snapshots: import('../types/trend.js').MonthlySnapshot[];
    annualSgaBreakdown: import('../types/trend.js').SgaBreakdownItem[];
    fiscalYearEnd: { year: number; month: number } | null;
    extractionNotes: string[];
  }> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません');

    const prompt = `以下の月次推移試算表から、月ごとのPL/BSを配列形式でJSONで返してください。

【ルール】
- 各月の数値は円単位の整数。不明な項目は null（数値が0なら0）。
- **各「月度」列のみを月として抽出する。「期間残高」「期末残高」「合計」「決算仕訳合計」列は月ではないので snapshots に含めない**（これらは年間集計なので月として扱わない）。
- PLは各「月度」列＝その月の発生額。BS残高列は各月末残高。
- 売上総利益が無ければ 売上高 - 売上原価 で計算。
- 経常利益が無ければ営業利益で代用。
- 各月の利益（営業・経常・当期純利益）は赤字ならマイナスのまま採用してよい。
- 売上高・売上原価・販管費・各資産・有利子負債は0以上。これらがマイナスなら符号の取り違えなので見直す。有利子負債は借入金＋社債等の合計で、借入があるのに0にしない。
- 月の並びは古い順（昇順）にソート。
- **販管費（販売費及び一般管理費）の科目別内訳**を annualSgaBreakdown に出力する。**必ず「期間残高」列（＝年間の確定値）の金額**を使う（各月度ではなく右端の期間残高列）。役員報酬・法定福利費・外注費・広告宣伝費・地代家賃・減価償却費など、販管費セクションに並ぶ各勘定科目を1行ずつ。合計行（販売費及び一般管理費 計）は含めない。金額0の科目は除外。
- fiscalYearEnd は会計期間の期末年月（月別推移の最後の月度＝期末月）。

【出力JSON】
{
  "snapshots": [
    {
      "year": 2025, "month": 10,
      "revenue": ..., "costOfSales": ..., "grossProfit": ...,
      "sgaExpenses": ..., "operatingIncome": ..., "ordinaryIncome": ...,
      "cashAndDeposits": ..., "currentAssets": ..., "currentLiabilities": ...,
      "totalAssets": ..., "netAssets": ...,
      "interestBearingDebt": 有利子負債, "netIncome": 当期純利益, "depreciation": 減価償却費, "interestExpense": 支払利息,
      "accountsReceivable": 売上債権(受取手形+売掛金+電子記録債権), "inventory": 棚卸資産(商品+製品+仕掛品+原材料+貯蔵品), "accountsPayable": 仕入債務(支払手形+買掛金+電子記録債務)
    }
  ],
  "annualSgaBreakdown": [ { "name": "役員報酬", "amount": 12000000 }, { "name": "地代家賃", "amount": 3600000 } ],
  "fiscalYearEnd": { "year": 2026, "month": 4 },
  "extractionNotes": ["注意点"]
}

【資料】
ファイル名: ${fileName}
${documentText}

JSONのみ返してください。`;

    logger.info(`月次推移抽出中（Gemini）: ${fileName}`);
    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
    });
    const text = response.text || '';
    this.recordUsage(response, '月次推移試算表抽出(Gemini)');

    const jsonStr = (text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || text);
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AIからの応答からJSONを解析できませんでした');

    const p = JSON.parse(jsonMatch[0]);
    const snapshots: import('../types/trend.js').MonthlySnapshot[] = (p.snapshots || []).map((s: any) => ({
      year: s.year, month: s.month,
      revenue: s.revenue ?? 0,
      costOfSales: s.costOfSales ?? 0,
      grossProfit: s.grossProfit ?? ((s.revenue ?? 0) - (s.costOfSales ?? 0)),
      sgaExpenses: s.sgaExpenses ?? 0,
      operatingIncome: s.operatingIncome ?? 0,
      ordinaryIncome: s.ordinaryIncome ?? s.operatingIncome ?? 0,
      cashAndDeposits: s.cashAndDeposits ?? 0,
      currentAssets: s.currentAssets ?? 0,
      currentLiabilities: s.currentLiabilities ?? 0,
      totalAssets: s.totalAssets ?? 0,
      netAssets: s.netAssets ?? 0,
      interestBearingDebt: s.interestBearingDebt ?? 0,
      netIncome: s.netIncome ?? 0,
      depreciation: s.depreciation ?? 0,
      interestExpense: s.interestExpense ?? 0,
      accountsReceivable: s.accountsReceivable ?? null,
      inventory: s.inventory ?? null,
      accountsPayable: s.accountsPayable ?? null,
    }));
    snapshots.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));

    // 販管費の科目別内訳（期間残高＝年間値）
    const annualSgaBreakdown: import('../types/trend.js').SgaBreakdownItem[] = Array.isArray(p.annualSgaBreakdown)
      ? p.annualSgaBreakdown
          .map((it: any) => ({ name: String(it?.name ?? '').trim(), amount: Number(it?.amount) || 0 }))
          .filter((it: any) => it.name && it.amount !== 0)
      : [];

    // 期末年月：AIの明示値を優先、無ければ最新スナップショットの年月
    let fiscalYearEnd: { year: number; month: number } | null = null;
    if (p.fiscalYearEnd && typeof p.fiscalYearEnd.year === 'number' && typeof p.fiscalYearEnd.month === 'number') {
      fiscalYearEnd = { year: p.fiscalYearEnd.year, month: p.fiscalYearEnd.month };
    } else if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1];
      fiscalYearEnd = { year: last.year, month: last.month };
    }

    return { snapshots, annualSgaBreakdown, fiscalYearEnd, extractionNotes: p.extractionNotes || [] };
  }

  /**
   * 補助書類（決算書に載らない書類）から、必要な項目だけをピンポイント抽出する。
   * - loan_repayment（借入金の返済計画表）: 年間返済元本・有利子負債・支払利息
   * - fixed_asset（固定資産台帳）: 減価償却費
   * - account_breakdown（勘定科目内訳書）: 有利子負債（借入金内訳）
   */
  async extractSupplementaryDoc(
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
    docType: 'loan_repayment' | 'fixed_asset' | 'account_breakdown',
  ): Promise<{
    fields: Record<string, number>;
    lender?: string;
    assets?: { name: string; acquisitionCost: number | null; depreciation: number | null; bookValue: number | null }[];
    notes: string[];
  }> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません');
    const spec = {
      loan_repayment: {
        name: '借入金の返済予定表（1件の借入）',
        json: '{ "lender": "借入先の金融機関名(例: 熊本銀行, 日本政策金融公庫, ○○リース)。読み取れなければ空文字", "annualDebtRepayment": この借入の年間返済元本(元金のみ), "interestBearingDebt": この借入の残高, "interestExpense": この借入の年間支払利息, "notes": ["補足や推定"] }',
        hint: '添付は「1件の借入」の返済予定表です（複数ページに跨ることがある）。借入先名（金融機関名）と、その借入の年間返済元本（12回分の元金合計。利息は含めない）・残高・年間支払利息を読み取る。同一借入の小計や繰越を二重に加算しないこと。',
      },
      fixed_asset: {
        name: '固定資産台帳',
        json: '{ "assets": [{"name": 資産名, "acquisitionCost": 取得価額, "depreciation": 当期償却額, "bookValue": 期末簿価(残存価格)}], "depreciation": 当期の減価償却費の合計, "notes": ["補足や推定"] }',
        hint: '固定資産台帳から、資産ごとに「資産名・取得価額・当期減価償却費・期末簿価(残存価格)」を assets 配列で読み取る。多数ある場合も全て列挙する（同じ資産の重複行や小計行は除く）。depreciation には当期減価償却費の合計を入れる。',
      },
      account_breakdown: {
        name: '勘定科目内訳明細書',
        json: '{ "interestBearingDebt": 借入金合計(短期借入金+長期借入金+社債+リース債務), "notes": ["補足や推定"] }',
        hint: '借入金の内訳から、全借入の残高合計を読み取る。',
      },
    }[docType];

    const prompt = `添付は「${spec.name}」です（写真・PDF・CSV等）。ここから指定項目だけを読み取り、JSONで返してください。
【ルール】
- 数値は円単位の整数。該当が無ければ null。金額は必ず0以上。
- ${spec.hint}
【出力JSON】
${spec.json}
JSONのみ返してください。`;

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: [{ role: 'user', parts: [...parts, { text: prompt }] }],
    });
    const text = response.text || '';
    this.recordUsage(response, `補助書類抽出(${docType})`);

    const jsonStr = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || text;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AIからの応答からJSONを解析できませんでした');
    const p = JSON.parse(jsonMatch[0]);

    const fields: Record<string, number> = {};
    for (const k of ['annualDebtRepayment', 'interestBearingDebt', 'interestExpense', 'depreciation']) {
      const v = p[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields[k] = v;
    }
    const lender = typeof p.lender === 'string' ? p.lender.trim() : '';
    // 固定資産台帳: 資産ごとの明細（最大200件）
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const assets = docType === 'fixed_asset' && Array.isArray(p.assets)
      ? p.assets
          .filter((a: any) => a && (typeof a.name === 'string') && (a.name.trim() !== ''))
          .slice(0, 200)
          .map((a: any) => ({
            name: String(a.name).trim().slice(0, 80),
            acquisitionCost: num(a.acquisitionCost),
            depreciation: num(a.depreciation),
            bookValue: num(a.bookValue),
          }))
      : undefined;
    return { fields, lender, assets, notes: Array.isArray(p.notes) ? p.notes : [] };
  }

  /** 業種を踏まえた深掘り質問を生成する。 */
  async generateDeepDiveQuestions(industry: string, financialContext: string): Promise<string[]> {
    if (!this.ai) return [];
    const prompt = `あなたは中小企業の財務・銀行融資に詳しいコンサルタントです。
業種「${industry || '不明'}」の企業について、銀行融資・経営改善の観点で経営者に確認すべき「深掘り質問」を5つ作成してください。

【この企業の財務状況】
${financialContext}

【ルール】
- 必ず業種特有のリスク・商習慣を踏まえる（例: 青果卸売なら「産地・仕入先の集中リスク」「鮮度劣化による廃棄ロス率」「取引先への与信・回収サイト」など）。
- 返済力・収益安定性・リスクに関わる、銀行が気にする論点にする。
- 各質問は具体的で1文。汎用的すぎる質問は避ける。

【出力JSON】
{ "questions": ["質問1", "質問2", "質問3", "質問4", "質問5"] }
JSONのみ返してください。`;
    try {
      const response = await this.ai.models.generateContent({ model: config.ai.geminiModel, contents: prompt });
      const text = response.text || '';
      this.recordUsage(response, '深掘り質問生成');
      const jsonStr = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || text;
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (!m) return [];
      const p = JSON.parse(m[0]);
      return Array.isArray(p.questions) ? p.questions.filter((q: unknown) => typeof q === 'string').slice(0, 6) : [];
    } catch (e) {
      logger.warn('深掘り質問生成に失敗:', e);
      return [];
    }
  }

  /** 深掘り質問への回答を踏まえて追加の所見・改善策を返す。 */
  async analyzeDeepDiveAnswers(
    industry: string,
    qa: { question: string; answer: string }[],
    financialContext: string,
  ): Promise<string> {
    if (!this.ai) return '';
    const answered = qa.filter((x) => (x.answer || '').trim());
    if (answered.length === 0) return '回答が入力されていません。質問に回答してから送信してください。';
    const qaText = qa
      .map((x, i) => `Q${i + 1}: ${x.question}\nA${i + 1}: ${(x.answer || '').trim() || '(未回答)'}`)
      .join('\n\n');
    const prompt = `あなたは中小企業の財務・銀行融資に詳しいコンサルタントです。業種「${industry || '不明'}」の企業。

【財務状況】
${financialContext}

【深掘り質問への経営者の回答】
${qaText}

上記の回答を踏まえて、次を日本語のMarkdownで簡潔に示してください（各セクション3点以内、経営者向けの平易な言葉で）:
## 追加で見えたリスク・強み
## 具体的な改善策（銀行評価の向上につながるもの）
## 銀行に説明する際のポイント`;
    try {
      const response = await this.ai.models.generateContent({ model: config.ai.geminiModel, contents: prompt });
      this.recordUsage(response, '深掘り回答分析');
      return response.text || '';
    } catch (e) {
      logger.warn('深掘り回答分析に失敗:', e);
      return '分析に失敗しました。時間をおいて再度お試しください。';
    }
  }

  async extractTextFromPDF(pdfBuffer: Buffer, fileName: string): Promise<string> {
    if (!this.ai) throw new Error('Gemini APIが初期化されていません');

    const base64 = pdfBuffer.toString('base64');
    logger.info(`PDFからテキスト抽出中（Gemini）... (${fileName})`);

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: `この決算書PDFから、全ての財務数値を正確にテキストとして抽出してください。
特に以下の項目を漏れなく抽出してください：
- 貸借対照表（BS）の全科目と金額
- 損益計算書（PL）の全科目と金額
- 売上高、営業利益、経常利益、当期純利益
- 流動資産、固定資産、流動負債、固定負債、純資産
- 借入金（短期・長期）
- 支払利息、受取利息
- 減価償却費
- 前期比較データがあれば前期の数値も

表形式で科目名と金額を整理して出力してください。` },
      ]}],
    });

    const text = response.text || '';
    this.recordUsage(response, 'PDF読み取り(Gemini)');
    logger.info(`PDFテキスト抽出完了 (${text.length}文字)`);
    return text;
  }

  private recordUsage(response: any, purpose: string): void {
    try {
      const usage = response.usageMetadata;
      if (usage) {
        usageTracker.record(
          config.ai.geminiModel,
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          purpose,
        );
      }
    } catch { /* ignore */ }
  }
}
