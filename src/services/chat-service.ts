import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { analysisStore } from './analysis-store.js';
import { buildOSContext } from './enterprise-os.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import * as repo from '../repositories/supabase-repository.js';
import { learningService } from './learning-service.js';
import type { TenantId } from '../types/auth.js';
import fs from 'fs';
import path from 'path';

const CHAT_DIR = path.resolve('data/chat');
const MEMORY_FILE = path.join(CHAT_DIR, 'company-memory.json');
const HISTORY_FILE = path.join(CHAT_DIR, 'conversation-history.json');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface OSSaveProposal {
  category: string;
  fileName: string;
  content: string;
}

export interface ChatResponse {
  reply: string;
  proposals: OSSaveProposal[];
}

export interface CompanyMemory {
  companyName: string;
  industry: string;
  employeeCount: string;
  fiscalYearEnd: string;
  notes: string[];
  businessDescription: string;
  strengths: string;
  challenges: string;
  keyClients: string;
  aiNotes: string[];
  lastUpdated: string;
}

/** 文字数制限 */
const MEMORY_LIMITS = {
  businessDescription: 1000,
  strengths: 500,
  challenges: 500,
  keyClients: 500,
  aiNoteItem: 300,
  aiNotesMax: 50,
};

export interface FreeeContextData {
  companyName: string;
  currentMonth: { year: number; month: number };
  pl: {
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    sgaExpenses: number;
    operatingIncome: number;
    ordinaryIncome: number;
  } | null;
  bs: {
    cashAndDeposits: number;
    currentAssets: number;
    currentLiabilities: number;
    totalAssets: number;
    totalLiabilities: number;
    netAssets: number;
  } | null;
}

/**
 * AI CFOチャットサービス（OpenAI GPT）
 *
 * データ保存はSupabase優先、未設定時はJSONファイルにフォールバック。
 */
export class ChatService {
  private ai: any = null;
  private freeeContext: FreeeContextData | null = null;
  private useSupabase: boolean;

  constructor() {
    const project = config.ai.gcpProject;
    if (project) {
      import('@google/genai').then(({ GoogleGenAI }) => {
        this.ai = new GoogleGenAI({ vertexai: true, project, location: config.ai.geminiRegion });
        logger.info('Gemini チャットクライアント (Vertex AI) を初期化しました');
      }).catch(e => logger.error('Gemini SDK初期化失敗:', e));
    }
    this.useSupabase = isSupabaseAvailable();
    if (this.useSupabase) {
      logger.info('チャット: Supabaseモードで動作');
    } else {
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      logger.info('チャット: JSONファイルモードで動作');
    }
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  setFreeeContext(data: FreeeContextData | null): void {
    this.freeeContext = data;
  }

  // ========== メモリ ==========

  async getMemory(tenantId?: TenantId): Promise<CompanyMemory> {
    // Supabase接続時はDBのみ参照（JSONフォールバック禁止: テナント間データ混在防止）
    if (this.useSupabase && tenantId) {
      try { return await repo.getCompanyMemory(tenantId); } catch (e) { logger.warn('Supabaseメモリ取得失敗'); }
    }
    return { companyName: '', industry: '', employeeCount: '', fiscalYearEnd: '', notes: [], businessDescription: '', strengths: '', challenges: '', keyClients: '', aiNotes: [], lastUpdated: '' };
  }

  async saveMemory(memory: CompanyMemory, tenantId?: TenantId): Promise<void> {
    memory.lastUpdated = new Date().toISOString();
    // Supabase接続時はDBのみ保存（JSONフォールバック禁止）
    if (this.useSupabase && tenantId) {
      try { await repo.saveCompanyMemory(tenantId, memory); return; } catch (e) { logger.warn('Supabaseメモリ保存失敗'); }
    }
  }

  // ========== 履歴 ==========

  async getHistory(tenantId?: TenantId): Promise<ChatMessage[]> {
    if (this.useSupabase && tenantId) {
      try { return await repo.getChatHistory(tenantId, 50); } catch (e) { logger.warn('Supabase履歴取得失敗'); }
    }
    return [];
  }

  private async saveHistory(history: ChatMessage[], tenantId?: TenantId): Promise<void> {
    if (this.useSupabase && tenantId) {
      const latest = history.slice(-2);
      try {
        for (const m of latest) {
          await repo.saveChatMessage(tenantId, m.role, m.content);
        }
        return;
      } catch (e) { logger.warn('Supabase履歴保存失敗'); }
    }
  }

  async clearHistory(tenantId?: TenantId): Promise<void> {
    if (this.useSupabase && tenantId) {
      try { await repo.clearChatHistory(tenantId); return; } catch (e) { logger.warn('Supabase履歴削除失敗'); }
    }
  }

  // ========== チャット送信 ==========

  async sendMessage(userMessage: string, tenantId?: TenantId): Promise<ChatResponse> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    const memory = await this.getMemory(tenantId);
    const history = await this.getHistory(tenantId);

    const analyses = analysisStore.list();
    const latestAnalysis = analyses.length > 0 ? analysisStore.get(analyses[0].id) : null;

    const systemPrompt = await this.buildSystemPrompt(memory, latestAnalysis, tenantId);

    // OpenAI messages → Gemini contents 変換マッピング:
    // - OpenAI system → Gemini systemInstruction
    // - OpenAI user → Gemini { role: 'user', parts: [{ text }] }
    // - OpenAI assistant → Gemini { role: 'model', parts: [{ text }] }
    const contents = [
      ...history.slice(-20).map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      })),
      { role: 'user' as const, parts: [{ text: userMessage }] },
    ];

    logger.info('チャットメッセージを送信中（Gemini Vertex AI）...');

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiModel,
      systemInstruction: systemPrompt,
      contents,
      config: { maxOutputTokens: 2048 },
    });

    const usage = response.usageMetadata;
    if (usage) {
      usageTracker.record(config.ai.geminiModel, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, 'チャット(Gemini)');
    }

    const assistantMessage = response.text || '';

    history.push(
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: assistantMessage, timestamp: new Date().toISOString() },
    );
    await this.saveHistory(history, tenantId);

    await this.tryUpdateMemory(userMessage, assistantMessage, memory, tenantId);

    return { reply: assistantMessage, proposals: [] };
  }

  private async buildSystemPrompt(memory: CompanyMemory, latestAnalysis: any, tenantId?: TenantId): Promise<string> {
    let osContext = '';
    try { osContext = await buildOSContext(tenantId); } catch { /* ignore */ }

    let prompt = `あなたは「AI CFO」です。中小企業の経営者のための財務・経営アドバイザーとして会話してください。

【あなたの役割】
- 経営者の相談相手として、財務・経理・資金繰り・銀行対策・事業計画に関する質問に答える
- 専門用語を使いすぎず、経営者が理解しやすい言葉で説明する
- 具体的な数値を交えて回答する
- 不明な点は正直に「わかりません」と言い、推測する場合はその旨を明記する
- 法的な判断や税務の最終判断は専門家への相談を勧める

【回答のスタイル】
- 結論ファーストで簡潔に
- 必要に応じて箇条書きを使う
- 数字はカンマ区切りで表示
- 良い点と改善点を分けて伝える

【企業AI OSについて】
企業AI OSの情報はあなたのコンテキストに含まれています。回答時に参照してください。
ユーザーが情報の保存を希望した場合は、画面のOS保存ボタンを使うよう案内してください。
`;

    if (memory.companyName || memory.industry || memory.businessDescription) {
      prompt += `\n【この会社の情報（記憶済み）】\n`;
      if (memory.companyName) prompt += `- 会社名: ${memory.companyName}\n`;
      if (memory.industry) prompt += `- 業種: ${memory.industry}\n`;
      if (memory.employeeCount) prompt += `- 従業員数: ${memory.employeeCount}\n`;
      if (memory.fiscalYearEnd) prompt += `- 決算期: ${memory.fiscalYearEnd}\n`;
      if (memory.businessDescription) prompt += `- 事業内容: ${memory.businessDescription}\n`;
      if (memory.strengths) prompt += `- 強み: ${memory.strengths}\n`;
      if (memory.challenges) prompt += `- 課題: ${memory.challenges}\n`;
      if (memory.keyClients) prompt += `- 主要顧客: ${memory.keyClients}\n`;
      if (memory.notes.length > 0) {
        prompt += `- メモ:\n`;
        memory.notes.forEach(n => { prompt += `  - ${n}\n`; });
      }
      if (memory.aiNotes && memory.aiNotes.length > 0) {
        prompt += `- AIが学習した情報:\n`;
        memory.aiNotes.slice(-10).forEach(n => { prompt += `  - ${n}\n`; });
      }
    }

    if (osContext) prompt += `\n${osContext}\n`;

    if (this.freeeContext) {
      const ctx = this.freeeContext;
      const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);
      prompt += `\n【freee会計データ（${ctx.currentMonth.year}年${ctx.currentMonth.month}月時点）】\n`;
      prompt += `- 事業所: ${ctx.companyName}\n`;
      if (ctx.pl) {
        prompt += `- 売上高: ${fmt(ctx.pl.revenue)}円\n`;
        prompt += `- 売上原価: ${fmt(ctx.pl.costOfSales)}円\n`;
        prompt += `- 売上総利益: ${fmt(ctx.pl.grossProfit)}円\n`;
        prompt += `- 販管費: ${fmt(ctx.pl.sgaExpenses)}円\n`;
        prompt += `- 営業利益: ${fmt(ctx.pl.operatingIncome)}円\n`;
        prompt += `- 経常利益: ${fmt(ctx.pl.ordinaryIncome)}円\n`;
        if (ctx.pl.revenue > 0) {
          prompt += `- 売上総利益率: ${(ctx.pl.grossProfit / ctx.pl.revenue * 100).toFixed(1)}%\n`;
          prompt += `- 営業利益率: ${(ctx.pl.operatingIncome / ctx.pl.revenue * 100).toFixed(1)}%\n`;
        }
      }
      if (ctx.bs) {
        prompt += `- 現預金: ${fmt(ctx.bs.cashAndDeposits)}円\n`;
        prompt += `- 流動資産: ${fmt(ctx.bs.currentAssets)}円\n`;
        prompt += `- 流動負債: ${fmt(ctx.bs.currentLiabilities)}円\n`;
        prompt += `- 総資産: ${fmt(ctx.bs.totalAssets)}円\n`;
        prompt += `- 純資産: ${fmt(ctx.bs.netAssets)}円\n`;
        if (ctx.bs.totalAssets > 0) prompt += `- 自己資本比率: ${(ctx.bs.netAssets / ctx.bs.totalAssets * 100).toFixed(1)}%\n`;
        if (ctx.bs.currentLiabilities > 0) prompt += `- 流動比率: ${(ctx.bs.currentAssets / ctx.bs.currentLiabilities * 100).toFixed(1)}%\n`;
      }
    }

    // 学習済み知見
    const insights = await learningService.getInsightsText();
    if (insights) {
      prompt += `\n【過去の分析から学習した知見】\n${insights}\n`;
    }

    if (latestAnalysis) {
      const r = latestAnalysis.rating;
      const a = latestAnalysis.additional;
      prompt += `\n【直近の財務分析結果（格付評価）】\n`;
      prompt += `- 格付スコア: ${r.totalScore}/129点（${r.rankLabel}）\n`;
      prompt += `- 売上高: ${new Intl.NumberFormat('ja-JP').format(latestAnalysis.ratingInput.revenue)}円\n`;
      prompt += `- 経常利益: ${new Intl.NumberFormat('ja-JP').format(latestAnalysis.ratingInput.ordinaryIncome)}円\n`;
      prompt += `- 自己資本比率: ${r.metrics.find((m: any) => m.id === 'equity_ratio')?.value?.toFixed(1) ?? '不明'}%\n`;
      prompt += `- 流動比率: ${r.metrics.find((m: any) => m.id === 'current_ratio')?.value?.toFixed(1) ?? '不明'}%\n`;
      prompt += `- 債務償還年数: ${r.metrics.find((m: any) => m.id === 'debt_repayment_years')?.value?.toFixed(1) ?? '不明'}年\n`;
      if (a.simpleCashFlow !== null) prompt += `- 簡易CF: ${new Intl.NumberFormat('ja-JP').format(a.simpleCashFlow)}円\n`;
      prompt += `- 強み: ${r.positives.slice(0, 3).map((p: string) => p.split('：')[0]).join('、')}\n`;
      prompt += `- 課題: ${r.negatives.slice(0, 3).map((n: string) => n.split('：')[0]).join('、') || 'なし'}\n`;
    }

    return prompt;
  }

  private async tryUpdateMemory(userMsg: string, assistantMsg: string, memory: CompanyMemory, tenantId?: TenantId): Promise<void> {
    const changes: Array<{ field: string; before: string; after: string; reason: string }> = [];

    // 基本フィールド（上書き許可）
    const patterns: Array<{ field: keyof CompanyMemory; regex: RegExp; extract: (m: RegExpMatchArray) => string }> = [
      { field: 'companyName', regex: /(?:うちの会社は|弊社は|当社は|会社名は|社名は)(.+?)(?:です|だ|。|$)/, extract: m => m[1].trim() },
      { field: 'industry', regex: /(?:業種は|業界は|事業は)(.+?)(?:です|だ|。|$)/, extract: m => m[1].trim() },
      { field: 'employeeCount', regex: /(?:従業員|社員|スタッフ).*?(\d+).*?(?:人|名)/, extract: m => m[1] + '人' },
      { field: 'fiscalYearEnd', regex: /(?:決算|決算期|決算月).*?(\d{1,2})月/, extract: m => m[1] + '月' },
    ];

    for (const p of patterns) {
      const match = userMsg.match(p.regex);
      if (match) {
        const newVal = p.extract(match);
        const oldVal = memory[p.field] as string;
        if (newVal !== oldVal) {
          changes.push({ field: p.field, before: oldVal, after: newVal, reason: `ユーザー発言: "${userMsg.substring(0, 80)}"` });
          (memory as any)[p.field] = newVal;
        }
      }
    }

    // 拡張フィールド（正規表現 + 上書き許可）
    const extPatterns: Array<{ field: keyof CompanyMemory; regex: RegExp; limit: number }> = [
      { field: 'businessDescription', regex: /(?:事業内容は|事業として|主な事業は)(.+?)(?:です|だ|。|$)/, limit: MEMORY_LIMITS.businessDescription },
      { field: 'strengths', regex: /(?:強みは|得意な|自社の強み)(.+?)(?:です|だ|。|$)/, limit: MEMORY_LIMITS.strengths },
      { field: 'challenges', regex: /(?:課題は|問題は|悩みは|困っている)(.+?)(?:です|だ|。|$)/, limit: MEMORY_LIMITS.challenges },
      { field: 'keyClients', regex: /(?:主要な取引先|主な顧客|得意先)(?:は|として)(.+?)(?:です|だ|。|$)/, limit: MEMORY_LIMITS.keyClients },
    ];

    for (const p of extPatterns) {
      const match = userMsg.match(p.regex);
      if (match) {
        let newVal = match[1].trim();
        if (newVal.length > p.limit) {
          newVal = newVal.substring(0, p.limit);
          logger.warn(`company_memory.${p.field}: ${p.limit}文字に切り詰めました`);
        }
        const oldVal = memory[p.field] as string;
        if (newVal !== oldVal) {
          changes.push({ field: p.field, before: oldVal, after: newVal, reason: `ユーザー発言: "${userMsg.substring(0, 80)}"` });
          (memory as any)[p.field] = newVal;
        }
      }
    }

    // AI自動メモ: ユーザーが事業に関する具体的な情報を語った場合、aiNotesに追記
    const infoPatterns = [
      /(?:売上|年商).*?(\d[\d,]*万?円)/,
      /(?:設立|創業).*?(\d{4}年)/,
      /(?:本社|拠点).*?(?:は|が)(.+?)(?:です|にあり|。|$)/,
      /(?:目標|計画).*?(?:は|が)(.+?)(?:です|。|$)/,
    ];

    for (const regex of infoPatterns) {
      const match = userMsg.match(regex);
      if (match) {
        let note = match[0].trim();
        if (note.length > MEMORY_LIMITS.aiNoteItem) {
          note = note.substring(0, MEMORY_LIMITS.aiNoteItem);
        }
        // 重複チェック（先頭30文字）
        const prefix = note.substring(0, 30);
        if (!memory.aiNotes) memory.aiNotes = [];
        const isDuplicate = memory.aiNotes.some(n => n.substring(0, 30) === prefix);
        if (!isDuplicate) {
          memory.aiNotes.push(note);
          // 上限チェック
          if (memory.aiNotes.length > MEMORY_LIMITS.aiNotesMax) {
            const removed = memory.aiNotes.shift();
            logger.warn(`company_memory.aiNotes: 上限${MEMORY_LIMITS.aiNotesMax}件超過、最古の項目を削除: "${removed?.substring(0, 50)}"`);
          }
          changes.push({ field: 'aiNotes', before: '', after: note, reason: `自動抽出: "${userMsg.substring(0, 80)}"` });
        }
      }
    }

    if (changes.length > 0) {
      await this.saveMemory(memory, tenantId);
      // 変更ログ出力（AIが誤って書き換えた時の原因追跡用）
      for (const c of changes) {
        logger.info(`[memory-update] tenant=${tenantId || 'none'} field=${c.field} before="${c.before}" after="${c.after}" reason="${c.reason}"`);
      }
    }
  }
}

export const chatService = new ChatService();
