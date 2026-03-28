import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ReportBuilder } from '../reports/report-builder.js';
import { createMockRawData } from '../../tests/fixtures/mock-data.js';
import { createMockTrendData } from '../../tests/fixtures/mock-trend.js';
import { renderDashboardHTML } from './dashboard-renderer.js';
import { renderReportHTML } from './html-renderer.js';
import { renderPlanHTML } from './plan-renderer.js';
import { renderFinanceAgentHTML, renderAccountingAgentHTML, renderFundingAgentHTML } from './agent-pages.js';
import { renderAccountingPageHTML } from './accounting-page.js';
import { renderChatHTML } from './chat-page.js';
import { renderTaskPageHTML } from './task-page.js';
import { receiptService } from '../services/receipt-service.js';
import { chatService } from '../services/chat-service.js';
import { taskService } from '../services/task-service.js';
import { generateMonthlyTasks } from '../config/task-templates.js';
import { renderRatingHTML } from './rating-page.js';
import { calculateBankRating, calculateAdditionalMetrics } from '../domain/banking/rating-calculator.js';
import { createMockRatingInput } from '../../tests/fixtures/mock-rating-input.js';
import { AnthropicAnalysisService } from '../services/anthropic-service.js';
import { usageTracker } from '../services/usage-tracker.js';
import { analysisStore } from '../services/analysis-store.js';
import { renderHistoryHTML } from './history-page.js';
import { googleTasksClient } from '../clients/google-tasks.js';
import { logger } from '../utils/logger.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import * as repo from '../repositories/supabase-repository.js';
import { learningService } from '../services/learning-service.js';

const anthropicService = new AnthropicAnalysisService();

const app = express();
const PORT = process.env.PORT || 3000;

// === freee APIキャッシュ（5分TTL） ===
const CACHE_TTL = 5 * 60 * 1000;
const apiCache = new Map<string, { data: any; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  if (entry) apiCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  apiCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

function clearCache(): void {
  apiCache.clear();
  logger.info('APIキャッシュをクリアしました');
}

// ファイルアップロード設定
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
  limits: { fileSize: 50 * 1024 * 1024 },  // 動画対応のため50MB
});

/** freeeトークンが保存されているか */
function getFreeeToken(): { access_token: string; refresh_token: string; company_id?: number; company_name?: string } | null {
  const tokenPath = path.resolve('data/freee-token.json');
  try {
    if (fs.existsSync(tokenPath)) {
      return JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

/** 選択中の事業所IDを取得 */
function getSelectedCompanyId(): number | null {
  const token = getFreeeToken();
  return token?.company_id ?? null;
}

/** freeeトークンファイルに事業所ID・名称を保存 */
function saveSelectedCompany(companyId: number, companyName: string): void {
  const tokenPath = path.resolve('data/freee-token.json');
  try {
    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    data.company_id = companyId;
    data.company_name = companyName;
    fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`事業所 ${companyName} (ID:${companyId}) を保存しました`);
  } catch (error) {
    logger.error('事業所保存エラー', error);
  }
}

/** 選択中の事業所名を取得 */
function getSelectedCompanyName(): string | null {
  const token = getFreeeToken();
  return token?.company_name ?? null;
}

/** freee接続済みか */
function isFreeeConnected(): boolean {
  return getFreeeToken() !== null;
}

/** レポートデータを生成（freee接続時は実データ、未接続時はモック） */
async function buildReport(year?: number, month?: number) {
  const cacheKey = `report-${year || 'default'}-${month || 'default'}-${getSelectedCompanyId()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { logger.info(`レポート: キャッシュヒット (${cacheKey})`); return cached; }
  const now = new Date();
  const targetYear = year || now.getFullYear();
  // デフォルトは前月
  const targetMonth = month || (now.getMonth() === 0 ? 12 : now.getMonth());

  const token = getFreeeToken();
  if (token) {
    try {
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);

      // 保存済みの事業所IDを使用、なければ最初の事業所
      const savedCompanyId = getSelectedCompanyId();
      let companyId: number;
      if (savedCompanyId) {
        companyId = savedCompanyId;
        logger.info(`freee実データで取得: 事業所ID=${companyId} ${targetYear}年${targetMonth}月`);
      } else {
        const companies = await freeeService.getCompanies();
        if (companies.length === 0) {
          throw new Error('freeeに事業所が見つかりません');
        }
        companyId = companies[0].id;
        logger.info(`freee実データで取得: 事業所=${companies[0].display_name} ${targetYear}年${targetMonth}月`);
      }

      const rawData = await freeeService.fetchMonthlyData(companyId, targetYear, targetMonth);
      const builder = new ReportBuilder();
      const report = await builder.build(rawData, targetYear, targetMonth);
      setCache(cacheKey, report);
      return report;
    } catch (error) {
      logger.warn('freeeデータ取得に失敗。モックデータで代替します:', error instanceof Error ? error.message : error);
      // フォールバック: モックデータ
    }
  }

  // モックデータ
  logger.info('モックデータでレポート生成');
  const rawData = createMockRawData();
  const builder = new ReportBuilder();
  return builder.build(rawData, targetYear, targetMonth);
}

/** トレンドデータを生成（freee接続時は実データ、未接続時はモック） */
async function buildTrendData(endYear?: number, endMonth?: number, monthCount: number = 6): Promise<import('../types/trend.js').TrendData> {
  const now = new Date();
  const targetYear = endYear || now.getFullYear();
  const targetMonth = endMonth || (now.getMonth() === 0 ? 12 : now.getMonth());

  const cacheKey = `trend-${targetYear}-${targetMonth}-${monthCount}-${getSelectedCompanyId()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { logger.info(`トレンド: キャッシュヒット (${cacheKey})`); return cached; }

  const token = getFreeeToken();
  if (token) {
    try {
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);

      const savedCompanyId = getSelectedCompanyId();
      let companyId: number;
      if (savedCompanyId) {
        companyId = savedCompanyId;
      } else {
        const companies = await freeeService.getCompanies();
        if (companies.length === 0) {
          throw new Error('freeeに事業所が見つかりません');
        }
        companyId = companies[0].id;
      }
      logger.info(`freee実データでトレンド取得: 事業所ID=${companyId} ${targetYear}年${targetMonth}月から${monthCount}か月分`);

      const trend = await freeeService.fetchTrendData(companyId, targetYear, targetMonth, monthCount);
      setCache(cacheKey, trend);

      // freeeデータをSupabaseに自動蓄積
      if (isSupabaseAvailable()) {
        for (const month of trend.months) {
          repo.upsertMonthlyActual(month).catch(e => logger.warn('Supabase蓄積失敗:', e));
        }
      }

      return trend;
    } catch (error) {
      logger.warn('freeeトレンドデータ取得に失敗。モックデータで代替します:', error instanceof Error ? error.message : error);
    }
  }

  logger.info('モックデータでトレンド生成');
  return createMockTrendData();
}

/** アップロード済みファイル一覧 */
function getUploadedFiles(): string[] {
  try {
    return fs.readdirSync(uploadDir)
      .filter(f => !f.startsWith('.'))
      .sort((a, b) => {
        const sa = fs.statSync(path.join(uploadDir, a)).mtime;
        const sb = fs.statSync(path.join(uploadDir, b)).mtime;
        return sb.getTime() - sa.getTime();
      });
  } catch {
    return [];
  }
}

/** 期間累計でレポートを再構築する */
async function buildPeriodReport(baseReport: any, fromMonth: string, toMonth: string): Promise<any> {
  const token = getFreeeToken();
  if (!token) return null;

  const cacheKey = `period-report-${fromMonth}-${toMonth}-${getSelectedCompanyId()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const auth = new FreeeAuthClient({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const freeeService = new FreeeService(auth);

    const companyId = getSelectedCompanyId();
    if (!companyId) return null;

    // 会計年度を取得
    const companyDetail = await freeeService.getCompanyDetail(companyId);
    const fiscalYears: Array<{ start_date: string; end_date: string }> = companyDetail.fiscal_years || [];

    const [fromY, fromM] = fromMonth.split('-').map(Number);
    const [toY, toM] = toMonth.split('-').map(Number);

    // from月が含まれる会計年度を特定
    let fiscalYear = fromY;
    if (fiscalYears.length > 0) {
      const targetDate = `${fromY}-${String(fromM).padStart(2, '0')}-15`;
      const matched = fiscalYears.find(fy => targetDate >= fy.start_date && targetDate <= fy.end_date);
      if (matched) fiscalYear = parseInt(matched.start_date.substring(0, 4));
    }

    // from〜to の期間PLを取得
    const { FreeeApiClient: ApiClient } = await import('../clients/freee-api.js');
    const apiClient = new ApiClient(auth);
    const plRes = await apiClient.getTrialPL(companyId, fiscalYear, fromM, toM);

    const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
    const periodPL = parsePLResponse(plRes, toY, toM);

    // 期間PLを使って各分析を再実行
    const { calculateFinancialMetrics } = await import('../domain/finance/metrics-calculator.js');
    const { analyzeCashFlow } = await import('../domain/cashflow/cashflow-analyzer.js');
    const { calculateBankingMetrics } = await import('../domain/banking/banking-evaluator.js');
    const { detectAnomalies } = await import('../domain/accounting/anomaly-detector.js');
    const { runAllEvaluations } = await import('../evaluators/index.js');
    const { TemplateCommentaryProvider } = await import('../commentary/commentary-generator.js');
    const { createMonthlyComparison } = await import('../domain/accounting/comparison.js');

    const currentBS = baseReport.balanceSheet;
    const previousBS = null; // 期間レポートでは前期BSなし

    const financialMetrics = calculateFinancialMetrics(periodPL, currentBS);
    const cashFlowAnalysis = analyzeCashFlow(periodPL, currentBS, previousBS);
    const bankingMetrics = calculateBankingMetrics(periodPL, currentBS, financialMetrics);
    const anomalies = detectAnomalies(periodPL, null, currentBS, null);
    const evaluations = runAllEvaluations({
      currentPL: periodPL,
      previousPL: null,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
    });

    const commentaryProvider = new TemplateCommentaryProvider();
    const comparison = createMonthlyComparison(periodPL, null);
    const commentary = await commentaryProvider.generate({
      currentPL: periodPL,
      previousPL: null,
      balanceSheet: currentBS,
      comparison,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
      evaluations,
      anomalies,
    });

    const overallLevel = evaluations.reduce((best: string, e: any) => {
      const levels = ['critical', 'warning', 'fair', 'good', 'excellent'];
      return levels.indexOf(e.level) > levels.indexOf(best) ? e.level : best;
    }, 'critical');

    const periodReport = {
      ...baseReport,
      monthlyPL: periodPL,
      comparison,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
      anomalies,
      evaluations,
      commentary,
      executiveSummary: {
        ...baseReport.executiveSummary,
        monthlyRevenue: periodPL.revenue,
        monthlyExpenses: periodPL.costOfSales + periodPL.sgaExpenses,
        monthlyProfit: periodPL.ordinaryIncome,
        revenueChangeRate: null,
        profitChangeRate: null,
        overallAssessment: overallLevel,
        keyMessage: commentary.executiveSummary,
      },
    };

    setCache(cacheKey, periodReport);
    return periodReport;
  } catch (error) {
    logger.warn('期間レポート構築に失敗:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ダッシュボード
app.get('/', async (req, res) => {
  try {
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const dateParam = req.query.date as string | undefined;

    let selectedDate: string | null = dateParam || null;
    let fromMonth: string | null = fromParam || null;
    let toMonth: string | null = toParam || null;

    // 期間ラベル判定
    let periodLabel: string | null = null;
    if (fromMonth && toMonth) {
      const diff = monthDiff(fromMonth, toMonth);
      if (diff === 0) periodLabel = '1m';
      else if (diff === 2) periodLabel = '3m';
      else if (diff === 5) periodLabel = '6m';
      else if (diff === 11) periodLabel = '12m';
      else periodLabel = 'custom';
    }

    // to パラメータの月でレポート生成（指定がなければデフォルト=前月）
    let reportYear: number | undefined;
    let reportMonth: number | undefined;
    if (toMonth) {
      const [y, m] = toMonth.split('-').map(Number);
      if (y && m) { reportYear = y; reportMonth = m; }
    } else if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (y && m) { reportYear = y; reportMonth = m; }
    }
    const report = await buildReport(reportYear, reportMonth);

    // from/to指定時は期間に合わせた月数でトレンドデータを取得
    let trendMonthCount = 6; // デフォルト
    let trendEndYear = reportYear;
    let trendEndMonth = reportMonth;
    if (fromMonth && toMonth) {
      const diff = monthDiff(fromMonth, toMonth);
      trendMonthCount = diff + 1; // from〜to の月数
      const [ty, tm] = toMonth.split('-').map(Number);
      if (ty && tm) { trendEndYear = ty; trendEndMonth = tm; }
    }
    const trend = await buildTrendData(trendEndYear, trendEndMonth, trendMonthCount);

    // 期間合計を算出（KPIカード用）
    const periodTotals = trend.months.length > 0 ? {
      revenue: trend.months.reduce((s, m) => s + m.revenue, 0),
      ordinaryIncome: trend.months.reduce((s, m) => s + m.ordinaryIncome, 0),
      operatingIncome: trend.months.reduce((s, m) => s + m.operatingIncome, 0),
      cashAndDeposits: trend.months[trend.months.length - 1].cashAndDeposits, // 最新月の残高
    } : null;

    // 期間指定時はレポート全体を期間累計で再構築
    let dashReport = report;
    if (fromMonth && toMonth && fromMonth !== toMonth) {
      const periodReport = await buildPeriodReport(report, fromMonth, toMonth);
      if (periodReport) dashReport = periodReport;
    }

    res.send(renderDashboardHTML(dashReport, trend, { selectedDate, fromMonth, toMonth, periodLabel, periodTotals }));
  } catch (error) {
    logger.error('ダッシュボード生成エラー', error);
    res.status(500).send('ダッシュボード生成に失敗しました');
  }
});

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}

// 月次レポート（HTML表示）
app.get('/report', async (_req, res) => {
  try {
    const report = await buildReport();
    res.send(renderReportHTML(report));
  } catch (error) {
    logger.error('レポート生成エラー', error);
    res.status(500).send('レポート生成に失敗しました');
  }
});

// 月次レポート（PDFダウンロード）
app.get('/report/pdf', async (_req, res) => {
  try {
    const report = await buildReport();
    const html = renderReportHTML(report);

    logger.info('PDF生成を開始...');
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Chart.jsの描画完了を待ち、全Canvasを画像（img）に変換
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const canvases = document.querySelectorAll('canvas');
          canvases.forEach((canvas) => {
            try {
              const img = document.createElement('img');
              img.src = canvas.toDataURL('image/png');
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.maxHeight = canvas.parentElement?.style.height || '280px';
              canvas.parentElement?.replaceChild(img, canvas);
            } catch (e) {
              // ignore
            }
          });
          resolve();
        }, 1000); // Chart.jsアニメーション完了を待つ
      });
    });

    // CSSメディアをprintに切り替え（印刷用スタイル適用）
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%;font-size:8px;color:#999;padding:0 15mm;display:flex;justify-content:space-between">
          <span>${report.meta.companyName} 月次経営レポート</span>
          <span>${report.meta.reportMonth}</span>
        </div>`,
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#999;padding:0 15mm;display:flex;justify-content:space-between">
          <span>AI CFO v${report.meta.version}</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
    await browser.close();
    logger.info('PDF生成完了');

    const month = report.meta.reportMonth;
    const company = report.meta.companyName;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(company)}_${month}_report.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('PDF生成エラー', error);
    res.status(500).send('PDF生成に失敗しました');
  }
});

// 事業計画AIエージェント
app.get('/plan', async (_req, res) => {
  try {
    const trend = await buildTrendData();
    const files = getUploadedFiles();
    res.send(renderPlanHTML(trend, files));
  } catch (error) {
    logger.error('事業計画ページエラー', error);
    res.status(500).send('ページの生成に失敗しました');
  }
});

app.post('/plan/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).send('ファイルが選択されていません');
    return;
  }
  logger.info(`ファイルアップロード: ${req.file.originalname} → ${req.file.filename}`);
  res.redirect('/plan');
});

// === 計画分析API（Claude） ===
import { planAnalysisService } from '../services/plan-analysis-service.js';

// 計画データ取得
app.get('/api/plan', (_req, res) => {
  res.json(planAnalysisService.getPlan());
});

// 月次目標を設定/更新
app.post('/api/plan/targets', express.json(), (req, res) => {
  const targets: Array<{ year: number; month: number; revenue: number; grossProfit: number; ordinaryIncome: number }> = req.body.targets || [];
  for (const t of targets) {
    planAnalysisService.setTarget(t);
  }
  res.json({ ok: true, count: targets.length });
});

// 計画 vs 実績の差分分析を実行（Claude）
app.post('/api/plan/analyze', express.json(), async (req, res) => {
  try {
    if (!planAnalysisService.isAvailable()) {
      res.status(400).json({ error: 'ANTHROPIC_API_KEYが未設定です' });
      return;
    }

    const trend = await buildTrendData();
    const plan = planAnalysisService.getPlan();

    if (plan.targets.length === 0) {
      res.status(400).json({ error: '計画データが未設定です。先に月次目標を入力してください。' });
      return;
    }

    const futureMonths = req.body.futureMonths || 3;
    const result = await planAnalysisService.analyzePlanVariance(
      trend.months,
      plan.targets,
      futureMonths,
    );

    res.json(result);
  } catch (error) {
    logger.error('計画分析エラー', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '分析に失敗しました' });
  }
});

// 修正計画を反映
app.post('/api/plan/apply', express.json(), (req, res) => {
  const targets = req.body.targets || [];
  planAnalysisService.applyRevisedTargets(targets);
  res.json({ ok: true, count: targets.length });
});

// 分析履歴
app.get('/api/plan/history', (_req, res) => {
  res.json(planAnalysisService.getHistory());
});

// === 学習ループAPI ===

// 学習実行
app.post('/api/learn', async (_req, res) => {
  try {
    if (!learningService.isAvailable()) {
      res.status(400).json({ error: 'ANTHROPIC_API_KEYが未設定です' });
      return;
    }
    const result = await learningService.runLearningCycle();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '学習に失敗しました' });
  }
});

app.get('/api/learn/insights', async (_req, res) => {
  const insights = await learningService.getInsights();
  res.json(insights);
});

// 財務分析AIエージェント
app.get('/agent/finance', async (_req, res) => {
  try {
    // freee接続時は自動的にfreeeデータで表示
    const token = getFreeeToken();
    if (token && getSelectedCompanyId()) {
      // /agent/finance/freee と同じロジックでfreeeデータを取得
      res.redirect('/agent/finance/freee');
      return;
    }
    // 未接続時はモックデータ
    const input = createMockRatingInput();
    const rating = calculateBankRating(input);
    const additional = calculateAdditionalMetrics(input);
    const aiAvailable = anthropicService.isAvailable();
    res.send(renderRatingHTML(rating, additional, { aiAvailable, aiCommentary: null, source: 'mock' }));
  } catch (error) {
    logger.error('財務分析ページエラー', error);
    const input = createMockRatingInput();
    const rating = calculateBankRating(input);
    const additional = calculateAdditionalMetrics(input);
    res.send(renderRatingHTML(rating, additional, { aiAvailable: false, aiCommentary: null, source: 'mock' }));
  }
});

// 財務分析：決算書アップロード → AI分析
app.post('/agent/finance/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).send('ファイルが選択されていません');
      return;
    }

    if (!anthropicService.isAvailable()) {
      res.status(400).send('ANTHROPIC_API_KEYが設定されていません。.envファイルを確認してください。');
      return;
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const ext = path.extname(fileName).toLowerCase();

    logger.info(`決算書分析開始: ${fileName}`);

    let documentText: string;

    if (ext === '.pdf') {
      // PDFはClaude Vision APIで読み取り
      const pdfBuffer = fs.readFileSync(filePath);
      documentText = await anthropicService.extractTextFromPDF(pdfBuffer, fileName);
    } else if (ext === '.csv') {
      documentText = fs.readFileSync(filePath, 'utf-8');
    } else {
      documentText = fs.readFileSync(filePath, 'utf-8');
    }

    // AIで財務データを抽出
    const { ratingInput, extractionNotes } = await anthropicService.extractFinancialData(documentText, fileName);

    // 格付計算
    const rating = calculateBankRating(ratingInput);
    const additional = calculateAdditionalMetrics(ratingInput);

    // AI解説を生成
    let aiCommentary: string | null = null;
    try {
      aiCommentary = await anthropicService.generateAnalysisCommentary(
        JSON.stringify(rating, null, 2),
        JSON.stringify(additional, null, 2),
      );
    } catch (e) {
      logger.warn('AIコメント生成をスキップしました', e);
    }

    // 分析結果を保存
    const analysisId = analysisStore.save({
      fileName,
      source: 'upload',
      ratingInput,
      rating,
      additional,
      aiCommentary,
      extractionNotes,
    });

    // 改善アクションからタスクを自動生成
    if (rating.actions.length > 0) {
      taskService.generateFromAnalysis(analysisId, rating.actions);
      logger.info(`分析結果から${rating.actions.length}件のタスクを自動生成しました`);
    }

    res.send(renderRatingHTML(rating, additional, {
      aiAvailable: true,
      aiCommentary,
      source: 'upload',
      fileName,
      extractionNotes,
      analysisId,
    }));
  } catch (error) {
    logger.error('決算書分析エラー', error);
    res.status(500).send(`分析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
});

// 財務分析：freeeデータからAI分析
app.get('/agent/finance/freee', async (_req, res) => {
  try {
    let input: import('../types/bank-rating.js').RatingInput;

    const token = getFreeeToken();
    if (token && getSelectedCompanyId()) {
      // freee実データからRatingInputを組み立てる
      // 会計年度の累計PL + 最新月のBSを取得
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);
      const companyId = getSelectedCompanyId()!;

      // 事業所の会計年度を取得
      const companyDetail = await freeeService.getCompanyDetail(companyId);
      const fiscalYears: Array<{ start_date: string; end_date: string }> = companyDetail.fiscal_years || [];
      logger.info(`事業所の会計年度一覧: ${JSON.stringify(fiscalYears)}`);

      // 最新の会計年度を特定
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
      const currentFY = fiscalYears.find(fy => todayStr >= fy.start_date && todayStr <= fy.end_date)
        || fiscalYears.sort((a, b) => b.start_date.localeCompare(a.start_date))[0];

      if (!currentFY) throw new Error('会計年度が見つかりません');

      const fyStartYear = parseInt(currentFY.start_date.substring(0, 4));
      const fyStartMonth = parseInt(currentFY.start_date.substring(5, 7));
      const fyEndMonth = parseInt(currentFY.end_date.substring(5, 7));

      // 現在月または会計年度末月のいずれか早い方まで
      const currentMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 前月
      const endMonth = Math.min(currentMonth, fyEndMonth) || fyEndMonth;

      logger.info(`会計年度累計PL取得: fiscal_year=${fyStartYear} ${fyStartMonth}月〜${endMonth}月`);

      // 累計PL（会計年度の期首〜直近月）と最新BSを並列取得
      const { FreeeApiClient: ApiClient } = await import('../clients/freee-api.js');
      const freeeApi = new ApiClient(auth);
      const [annualPLRes, latestBSRes] = await Promise.all([
        freeeApi.getTrialPL(companyId, fyStartYear, fyStartMonth, endMonth),
        freeeApi.getTrialBS(companyId, fyStartYear, endMonth, endMonth),
      ]);

      const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
      const { parseBSResponse } = await import('../domain/accounting/bs-parser.js');
      const annualPL = parsePLResponse(annualPLRes, now.getFullYear(), endMonth);
      const bs = parseBSResponse(latestBSRes, now.getFullYear(), endMonth);

      const monthsElapsed = ((endMonth - fyStartMonth + 12) % 12) + 1;

      input = {
        totalAssets: bs.totalAssets,
        currentAssets: bs.currentAssets,
        fixedAssets: bs.fixedAssets,
        currentLiabilities: bs.currentLiabilities,
        fixedLiabilities: bs.fixedLiabilities,
        netAssets: bs.netAssets,
        interestBearingDebt: 0,
        cashAndDeposits: bs.cashAndDeposits,

        // PL（累計実数値をそのまま使用）
        revenue: annualPL.revenue,
        operatingIncome: annualPL.operatingIncome,
        ordinaryIncome: annualPL.ordinaryIncome,
        netIncome: annualPL.netIncome,
        interestExpense: annualPL.nonOperatingExpenses,
        interestIncome: annualPL.nonOperatingIncome,
        depreciation: 0,

        prevOrdinaryIncome: null,
        prevTotalAssets: null,
        annualDebtRepayment: null,
        profitFlowHistory: [
          annualPL.ordinaryIncome > 0 ? 'positive' : annualPL.ordinaryIncome < 0 ? 'negative' : 'zero',
          'positive',
          'positive',
        ],
      };
      logger.info(`freee累計データで格付分析: 累計${monthsElapsed}か月 売上=${annualPL.revenue} 経常利益=${annualPL.ordinaryIncome}`);
    } else {
      input = createMockRatingInput();
    }

    const rating = calculateBankRating(input);
    const additional = calculateAdditionalMetrics(input);

    let aiCommentary: string | null = null;
    if (anthropicService.isAvailable()) {
      try {
        aiCommentary = await anthropicService.generateAnalysisCommentary(
          JSON.stringify(rating, null, 2),
          JSON.stringify(additional, null, 2),
        );
      } catch (e) {
        logger.warn('AIコメント生成をスキップしました', e);
      }
    }

    const analysisId = analysisStore.save({
      fileName: null,
      source: 'freee',
      ratingInput: input,
      rating,
      additional,
      aiCommentary,
      extractionNotes: [],
    });

    res.send(renderRatingHTML(rating, additional, {
      aiAvailable: anthropicService.isAvailable(),
      aiCommentary,
      source: 'freee',
      analysisId,
    }));
  } catch (error) {
    logger.error('freee分析エラー', error);
    res.status(500).send('分析に失敗しました');
  }
});

// 分析履歴一覧
app.get('/agent/finance/history', (_req, res) => {
  const analyses = analysisStore.list();
  res.send(renderHistoryHTML(analyses));
});

// 保存済み分析の詳細表示
app.get('/agent/finance/history/:id', (req, res) => {
  const analysis = analysisStore.get(req.params.id);
  if (!analysis) {
    res.status(404).send('分析結果が見つかりません');
    return;
  }
  res.send(renderRatingHTML(analysis.rating, analysis.additional, {
    aiAvailable: true,
    aiCommentary: analysis.aiCommentary,
    source: analysis.source as 'upload' | 'freee' | 'mock',
    fileName: analysis.fileName ?? undefined,
    extractionNotes: analysis.extractionNotes,
    analysisId: analysis.id,
    savedAt: analysis.createdAt,
  }));
});

// 分析結果の削除
app.post('/agent/finance/history/:id/delete', (req, res) => {
  analysisStore.delete(req.params.id);
  res.redirect('/agent/finance/history');
});

// 分析結果のJSONダウンロード
app.get('/agent/finance/history/:id/json', (req, res) => {
  const analysis = analysisStore.get(req.params.id);
  if (!analysis) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="${analysis.id}.json"`);
  res.json(analysis);
});

// 会計AIエージェント
app.get('/agent/accounting', (_req, res) => {
  res.send(renderAccountingPageHTML({ aiAvailable: receiptService.isAvailable() }));
});

// 会計AI：領収書・PDFの解析
app.post('/agent/accounting/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).send('ファイルが選択されていません'); return; }
    if (!receiptService.isAvailable()) { res.status(400).send('ANTHROPIC_API_KEYが未設定です'); return; }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const ext = path.extname(fileName).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    let analysis;
    if (ext === '.pdf') {
      analysis = await receiptService.analyzeReceiptPDF(buffer, fileName);
    } else {
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';
      analysis = await receiptService.analyzeReceiptImage(buffer, mimeType, fileName);
    }

    res.send(renderAccountingPageHTML({ aiAvailable: true, analysis }));
  } catch (error) {
    logger.error('領収書解析エラー', error);
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `解析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
    }));
  }
});

// 会計AI：動画からレシート解析
app.post('/agent/accounting/analyze-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).send('動画が選択されていません'); return; }
    if (!receiptService.isAvailable()) { res.status(400).send('GEMINI_API_KEYが未設定です'); return; }

    const buffer = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeMap: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm' };
    const mimeType = mimeMap[ext] || 'video/mp4';

    // Geminiで動画を直接解析
    const analysis = await receiptService.analyzeVideo(buffer, mimeType, req.file.originalname);

    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      analysis,
    }));
  } catch (error) {
    logger.error('動画解析エラー', error);
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `解析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
    }));
  }
});

// 会計AI：CSVダウンロード
app.get('/agent/accounting/csv', (req, res) => {
  try {
    const entriesJson = req.query.entries as string;
    const entries = JSON.parse(entriesJson);
    const csv = receiptService.toCSV(entries);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="journal-entries-${Date.now()}.csv"`);
    // BOM付きUTF-8（Excelで文字化けしないように）
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(400).send('CSVの生成に失敗しました');
  }
});

// 会計AI：freee APIに仕訳送信
app.post('/agent/accounting/send-freee', express.urlencoded({ extended: true }), (req, res) => {
  // TODO: freee APIへの仕訳送信を実装
  // 現在はfreee APIの認証が未接続のため、プレビューのみ
  res.send(renderAccountingPageHTML({
    aiAvailable: true,
    error: 'freee APIへの送信は、freee連携設定でアクセストークンを設定した後に利用できます。現在はCSVダウンロードをご利用ください。',
  }));
});

// 資金調達AIエージェント
app.get('/agent/funding', (_req, res) => {
  res.send(renderFundingAgentHTML());
});

// API（JSON）
app.get('/api/report', async (_req, res) => {
  try {
    const report = await buildReport();
    res.json(report);
  } catch (error) {
    logger.error('API エラー', error);
    res.status(500).json({ error: 'レポート生成に失敗しました' });
  }
});

// === freee OAuth認証 ===
import { FreeeAuthClient } from '../clients/freee-auth.js';
import { FreeeService } from '../services/freee-service.js';
const freeeAuth = new FreeeAuthClient();

app.get('/auth/freee', (_req, res) => {
  res.redirect(freeeAuth.getAuthorizationUrl());
});

app.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) { res.status(400).send('認可コードがありません'); return; }

    logger.info(`freee callback受信: code=${code.substring(0, 10)}...`);
    logger.info(`client_id=${process.env.FREEE_CLIENT_ID}`);
    logger.info(`redirect_uri=${process.env.FREEE_REDIRECT_URI}`);

    // 直接axiosでトークン交換
    const tokenResponse = await axios.post('https://accounts.secure.freee.co.jp/public_api/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FREEE_CLIENT_ID,
      client_secret: process.env.FREEE_CLIENT_SECRET,
      code,
      redirect_uri: process.env.FREEE_REDIRECT_URI || 'http://localhost:3000/callback',
    });

    const tokenData = tokenResponse.data;

    // トークンをdata/freee-token.jsonに保存
    const tokenPath = path.resolve('data/freee-token.json');
    const tokenDir = path.dirname(tokenPath);
    if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in - 60) * 1000,
    }, null, 2), 'utf-8');

    logger.info('freee認証完了、トークンを保存しました');

    // 事業所選択ページへリダイレクト
    res.redirect('/settings/company');
  } catch (error: any) {
    const detail = error?.response?.data ? JSON.stringify(error.response.data) : (error instanceof Error ? error.message : '不明なエラー');
    logger.error('freee認証エラー詳細:', detail);
    res.status(500).send(`freee認証に失敗しました: ${detail}`);
  }
});

// === 事業所選択 ===
app.get('/settings/company', async (_req, res) => {
  try {
    const token = getFreeeToken();
    if (!token) {
      res.redirect('/auth/freee');
      return;
    }

    const auth = new FreeeAuthClient({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const freeeService = new FreeeService(auth);
    const companies = await freeeService.getCompanies();
    const selectedId = getSelectedCompanyId();

    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const companyCards = companies.map(c => {
      const isSelected = c.id === selectedId;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border:1px solid ${isSelected ? '#6366f1' : '#e5e7eb'};border-radius:10px;margin-bottom:10px;background:${isSelected ? 'rgba(99,102,241,0.06)' : '#fff'};transition:all .15s">
          <div>
            <div style="font-weight:700;font-size:15px;color:#1f2937">${escHtml(c.display_name)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">事業所ID: ${c.id}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${isSelected ? '<span style="font-size:12px;font-weight:600;color:#6366f1;background:rgba(99,102,241,0.1);padding:4px 12px;border-radius:6px">選択中</span>' : ''}
            <form method="POST" action="/settings/company" style="margin:0">
              <input type="hidden" name="companyId" value="${c.id}">
              <input type="hidden" name="companyName" value="${escHtml(c.display_name)}">
              <button type="submit" style="padding:8px 20px;border-radius:8px;border:none;background:${isSelected ? '#e5e7eb' : '#6366f1'};color:${isSelected ? '#6b7280' : '#fff'};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s">${isSelected ? '選択済み' : '選択する'}</button>
            </form>
          </div>
        </div>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>事業所の選択 | AI CFO</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans",Meiryo,sans-serif;background:#f4f5f7;color:#1f2937;font-size:14px;min-height:100vh;display:flex;align-items:center;justify-content:center}
</style>
</head>
<body>
<div style="max-width:520px;width:100%;margin:40px auto;padding:0 20px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="font-size:40px;margin-bottom:12px">🏢</div>
    <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">事業所の選択</h1>
    <p style="font-size:14px;color:#6b7280">freeeに登録されている事業所から、使用する事業所を選択してください。</p>
  </div>
  <div style="margin-bottom:24px">
    ${companyCards}
  </div>
  ${selectedId ? `<div style="text-align:center"><a href="/" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">ダッシュボードへ</a></div>` : '<p style="text-align:center;color:#6b7280;font-size:13px">事業所を選択するとダッシュボードに進めます。</p>'}
</div>
</body>
</html>`);
  } catch (error) {
    logger.error('事業所一覧取得エラー', error);
    res.status(500).send('事業所一覧の取得に失敗しました。freee連携を再設定してください。');
  }
});

app.post('/settings/company', express.urlencoded({ extended: true }), (req, res) => {
  const companyId = parseInt(req.body.companyId, 10);
  const companyName = req.body.companyName || '';
  if (!companyId) {
    res.status(400).send('事業所IDが不正です');
    return;
  }
  saveSelectedCompany(companyId, companyName);
  clearCache(); // 事業所変更時はキャッシュクリア
  res.redirect('/settings/company');
});

// === チャット ===
app.get('/chat', async (_req, res) => {
  const history = await chatService.getHistory();
  const memory = await chatService.getMemory();
  res.send(renderChatHTML(history, memory, chatService.isAvailable()));
});

app.post('/chat/send', express.json(), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) { res.json({ error: 'メッセージが空です' }); return; }

    // 「タスクにして」「タスク追加」でタスク自動生成
    const taskMatch = message.match(/(?:タスクにして|タスク追加|TODO)[：:]?\s*(.+)?/);
    if (taskMatch) {
      const title = taskMatch[1]?.trim() || message.replace(/タスクにして|タスク追加|TODO/g, '').trim();
      if (title) {
        taskService.addFromChat(title);
        res.json({ reply: `✅ タスクを追加しました：「${title}」\n\nタスクボードで確認できます。` });
        return;
      }
    }

    // freeeデータをチャットコンテキストに設定
    await loadFreeeContextForChat();

    const result = await chatService.sendMessage(message);
    res.json(result);
  } catch (error) {
    logger.error('チャットエラー', error);
    res.json({ error: error instanceof Error ? error.message : '不明なエラー' });
  }
});

/** freeeのPL/BSデータをチャット用コンテキストとして読み込む */
async function loadFreeeContextForChat(): Promise<void> {
  const token = getFreeeToken();
  if (!token) {
    chatService.setFreeeContext(null);
    return;
  }

  const cacheKey = `chat-freee-context-${getSelectedCompanyId()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    chatService.setFreeeContext(cached);
    return;
  }

  try {
    const auth = new FreeeAuthClient({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const freeeService = new FreeeService(auth);

    const savedCompanyId = getSelectedCompanyId();
    let companyId: number;
    let companyName: string;
    if (savedCompanyId) {
      companyId = savedCompanyId;
      companyName = token.company_name || `事業所${companyId}`;
    } else {
      const companies = await freeeService.getCompanies();
      if (companies.length === 0) { chatService.setFreeeContext(null); return; }
      companyId = companies[0].id;
      companyName = companies[0].display_name;
    }

    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 前月

    const rawData = await freeeService.fetchMonthlyData(companyId, targetYear, targetMonth);

    // PL/BSを解析
    const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
    const { parseBSResponse } = await import('../domain/accounting/bs-parser.js');
    const currentPL = parsePLResponse(rawData.currentMonthPL, targetYear, targetMonth);
    const currentBS = parseBSResponse(rawData.currentMonthBS, targetYear, targetMonth);

    const contextData = {
      companyName,
      currentMonth: { year: targetYear, month: targetMonth },
      pl: {
        revenue: currentPL.revenue,
        costOfSales: currentPL.costOfSales,
        grossProfit: currentPL.grossProfit,
        sgaExpenses: currentPL.sgaExpenses,
        operatingIncome: currentPL.operatingIncome,
        ordinaryIncome: currentPL.ordinaryIncome,
      },
      bs: {
        cashAndDeposits: currentBS.cashAndDeposits,
        currentAssets: currentBS.currentAssets,
        currentLiabilities: currentBS.currentLiabilities,
        totalAssets: currentBS.totalAssets,
        totalLiabilities: currentBS.totalLiabilities,
        netAssets: currentBS.netAssets,
      },
    };

    setCache(cacheKey, contextData);
    chatService.setFreeeContext(contextData);
    logger.info('チャット用freeeコンテキストを設定しました');
  } catch (error) {
    logger.warn('チャット用freeeデータ取得に失敗:', error instanceof Error ? error.message : error);
    chatService.setFreeeContext(null);
  }
}

app.post('/chat/memory', express.urlencoded({ extended: true }), async (req, res) => {
  const memory = await chatService.getMemory();
  memory.companyName = req.body.companyName || '';
  memory.industry = req.body.industry || '';
  memory.employeeCount = req.body.employeeCount || '';
  memory.fiscalYearEnd = req.body.fiscalYearEnd || '';
  memory.notes = (req.body.notes || '').split('\n').filter((n: string) => n.trim());
  await chatService.saveMemory(memory);
  res.redirect('/chat');
});

app.post('/chat/clear', async (_req, res) => {
  await chatService.clearHistory();
  res.json({ ok: true });
});

// 企業AI OSへの保存を確定
import { saveKnowledge } from '../services/enterprise-os.js';
app.post('/chat/save-to-os', express.json(), (req, res) => {
  const items: Array<{ category: string; fileName: string; content: string }> = req.body.items || [];
  const results: string[] = [];
  for (const item of items) {
    const result = saveKnowledge(item.category, item.fileName, item.content);
    results.push(result.message);
    logger.info(`企業AI OS保存確定: ${result.message}`);
  }
  res.json({ ok: true, results });
});

// === タスクボード ===
app.get('/tasks', (req, res) => {
  const tasks = taskService.list();
  const summary = taskService.getSummary();
  const googleParam = req.query.google as string | undefined;
  const countParam = req.query.count as string | undefined;
  res.send(renderTaskPageHTML(tasks, summary, {
    googleConnected: googleParam || null,
    googleSyncCount: countParam ? parseInt(countParam, 10) : undefined,
  }));
});

app.post('/tasks/add', express.urlencoded({ extended: true }), (req, res) => {
  taskService.add({
    title: req.body.title,
    description: '',
    priority: req.body.priority || 'medium',
    status: 'todo',
    category: req.body.category || 'general',
    source: 'manual',
  });
  res.redirect('/tasks');
});

app.post('/tasks/:id/status', express.urlencoded({ extended: true }), async (req, res) => {
  const task = taskService.get(req.params.id);
  taskService.update(req.params.id, { status: req.body.status });

  // Google Tasks連携: 完了時に同期
  if (task && req.body.status === 'done' && googleTasksClient.isAuthenticated()) {
    try {
      const listId = await googleTasksClient.getOrCreateTaskList('AI CFO');
      const catLabel = ({ finance: '【財務】', accounting: '【会計】', cashflow: '【資金繰り】', plan: '【事業計画】', general: '' } as Record<string, string>)[task.category] || '';
      const prLabel = task.priority === 'high' ? '[重要] ' : '';
      const fullTitle = `${prLabel}${catLabel}${task.title}`;
      const googleTask = await googleTasksClient.findTaskByTitle(listId, fullTitle);
      if (googleTask?.id) {
        await googleTasksClient.updateTaskStatus(listId, googleTask.id, 'completed');
        logger.info(`Google Taskを完了に更新: ${fullTitle}`);
      }
    } catch (e) {
      logger.warn('Google Task完了同期に失敗:', e instanceof Error ? e.message : e);
    }
  }

  res.redirect('/tasks');
});

app.post('/tasks/:id/edit', express.urlencoded({ extended: true }), (req, res) => {
  taskService.update(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    priority: req.body.priority,
    category: req.body.category,
    dueDate: req.body.dueDate || undefined,
  });
  res.redirect('/tasks');
});

app.post('/tasks/:id/delete', (_req, res) => {
  taskService.delete(_req.params.id);
  res.redirect('/tasks');
});

// 月次タスクの一括生成
app.post('/tasks/generate-monthly', express.urlencoded({ extended: true }), (req, res) => {
  const [year, month] = (req.body.month || '').split('-').map(Number);
  if (!year || !month) { res.redirect('/tasks'); return; }
  const tasks = generateMonthlyTasks(year, month);
  taskService.addBatch(tasks);
  logger.info(`${year}年${month}月の定型タスク${tasks.length}件を生成しました`);
  res.redirect('/tasks');
});

// === Google Tasks連携 ===
// Google OAuth認証開始
app.get('/auth/google', (_req, res) => {
  if (!googleTasksClient.isConfigured()) {
    res.status(400).send('Google API認証情報が未設定です。.envにGOOGLE_CLIENT_IDとGOOGLE_CLIENT_SECRETを設定してください。');
    return;
  }
  res.redirect(googleTasksClient.getAuthUrl());
});

// Google OAuthコールバック
app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) { res.status(400).send('認可コードがありません'); return; }
    await googleTasksClient.exchangeCode(code);
    res.redirect('/tasks?google=connected');
  } catch (error) {
    logger.error('Google認証エラー', error);
    res.status(500).send(`Google認証に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
});

// Google連携解除
app.post('/auth/google/disconnect', (_req, res) => {
  googleTasksClient.disconnect();
  res.redirect('/tasks');
});

// Google Tasksにタスクを同期（選択されたタスクのみ）
app.post('/tasks/sync-google', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    if (!googleTasksClient.isAuthenticated()) {
      res.redirect('/auth/google');
      return;
    }

    const taskIds = (req.body.taskIds || '').split(',').filter((id: string) => id.trim());
    if (taskIds.length === 0) {
      res.redirect('/tasks');
      return;
    }

    const listId = await googleTasksClient.getOrCreateTaskList('AI CFO');

    // 既存のGoogleタスクを取得して重複チェック
    const existingGoogleTasks = await googleTasksClient.listTasks(listId);
    const existingTitles = new Set(existingGoogleTasks.map(t => t.title));

    let syncCount = 0;
    for (const id of taskIds) {
      const task = taskService.get(id);
      if (!task) continue;

      const catLabel = ({ finance: '【財務】', accounting: '【会計】', cashflow: '【資金繰り】', plan: '【事業計画】', general: '' } as Record<string, string>)[task.category] || '';
      const prLabel = task.priority === 'high' ? '[重要] ' : '';
      const fullTitle = `${prLabel}${catLabel}${task.title}`;

      if (existingTitles.has(fullTitle)) continue; // 同名タスクはスキップ

      await googleTasksClient.addTask(listId, {
        title: fullTitle,
        notes: task.description || undefined,
        due: task.dueDate || undefined,
        status: task.status === 'done' ? 'completed' : 'needsAction',
      });
      syncCount++;
    }

    logger.info(`Google Tasksに${syncCount}件のタスクを同期しました`);
    res.redirect(`/tasks?google=synced&count=${syncCount}`);
  } catch (error) {
    logger.error('Google Tasks同期エラー', error);
    res.status(500).send(`同期に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
});

// === 秘書AI連携API ===
// タスク一覧（秘書AIが取得）
app.get('/api/tasks', (_req, res) => {
  res.json(taskService.exportForAssistant());
});

// タスク追加（秘書AIが追加）
app.post('/api/tasks', express.json(), (req, res) => {
  const task = taskService.add({
    title: req.body.title,
    description: req.body.description || '',
    priority: req.body.priority || 'medium',
    status: 'todo',
    category: req.body.category || 'general',
    source: 'manual',
  });
  res.json(task);
});

// タスク更新（秘書AIがステータス変更）
app.patch('/api/tasks/:id', express.json(), (req, res) => {
  const task = taskService.update(req.params.id, req.body);
  if (!task) { res.status(404).json({ error: 'not found' }); return; }
  res.json(task);
});

// 会社情報（秘書AIが参照）
app.get('/api/company', async (_req, res) => {
  const memory = await chatService.getMemory();
  const analyses = analysisStore.list();
  res.json({ company: memory, latestAnalyses: analyses.slice(0, 5) });
});

// API使用量
app.get('/api/usage', (_req, res) => {
  res.json(usageTracker.getSummary());
});

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  AI CFO');
  console.log('========================================');
  console.log(`  ダッシュボード:     http://localhost:${PORT}`);
  console.log(`  月次レポート:       http://localhost:${PORT}/report`);
  console.log(`  財務分析AI:         http://localhost:${PORT}/agent/finance`);
  console.log(`  事業計画AI:         http://localhost:${PORT}/plan`);
  console.log(`  会計AI:             http://localhost:${PORT}/agent/accounting`);
  console.log(`  資金調達AI:         http://localhost:${PORT}/agent/funding`);
  console.log(`  API (JSON):         http://localhost:${PORT}/api/report`);
  console.log('========================================');
  console.log('');
});
