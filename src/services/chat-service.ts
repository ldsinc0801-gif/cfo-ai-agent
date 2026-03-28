import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { analysisStore } from './analysis-store.js';
import { buildOSContext } from './enterprise-os.js';

const CHAT_DIR = path.resolve('data/chat');
const MEMORY_FILE = path.join(CHAT_DIR, 'company-memory.json');
const HISTORY_FILE = path.join(CHAT_DIR, 'conversation-history.json');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** 企業AI OSへの保存提案 */
export interface OSSaveProposal {
  category: string;
  fileName: string;
  content: string;
}

/** チャット応答 */
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
  lastUpdated: string;
}

/** freeeから取得したサマリデータ（チャットコンテキスト用） */
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
 * ユーザーの会社情報を記憶し、過去の分析結果をコンテキストに持ちながら
 * 経営に関する質問に回答する。
 */
export class ChatService {
  private client: OpenAI | null = null;
  private freeeContext: FreeeContextData | null = null;

  constructor() {
    const apiKey = config.ai.openaiApiKey;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      logger.info('OpenAI APIクライアントを初期化しました');
    }
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /** freeeのコンテキストデータを設定 */
  setFreeeContext(data: FreeeContextData | null): void {
    this.freeeContext = data;
  }

  /** 会社情報メモリを取得 */
  getMemory(): CompanyMemory {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    }
    return {
      companyName: '',
      industry: '',
      employeeCount: '',
      fiscalYearEnd: '',
      notes: [],
      lastUpdated: '',
    };
  }

  /** 会社情報メモリを保存 */
  saveMemory(memory: CompanyMemory): void {
    memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
  }

  /** 会話履歴を取得 */
  getHistory(): ChatMessage[] {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
    return [];
  }

  /** 会話履歴を保存 */
  private saveHistory(history: ChatMessage[]): void {
    const trimmed = history.slice(-50);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  }

  /** 会話履歴をクリア */
  clearHistory(): void {
    if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
  }

  /** チャット送信（OpenAI GPT） */
  async sendMessage(userMessage: string): Promise<ChatResponse> {
    if (!this.client) throw new Error('OPENAI_API_KEYが未設定です');

    const memory = this.getMemory();
    const history = this.getHistory();

    // 直近の分析結果を取得
    const analyses = analysisStore.list();
    const latestAnalysis = analyses.length > 0 ? analysisStore.get(analyses[0].id) : null;

    // システムプロンプト構築
    const systemPrompt = this.buildSystemPrompt(memory, latestAnalysis);

    // API用のメッセージ履歴（直近20件）
    const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    logger.info('チャットメッセージを送信中（GPT）...');

    const response = await this.client.chat.completions.create({
      model: config.ai.chatModel,
      max_tokens: 2048,
      messages: apiMessages,
    });

    const usage = response.usage;
    if (usage) {
      usageTracker.record(response.model, usage.prompt_tokens, usage.completion_tokens, 'チャット(GPT)');
    }

    const assistantMessage = response.choices[0]?.message?.content || '';

    // 履歴に追加
    history.push(
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: assistantMessage, timestamp: new Date().toISOString() },
    );
    this.saveHistory(history);

    // 会社情報の自動更新を試みる
    this.tryUpdateMemory(userMessage, assistantMessage, memory);

    return { reply: assistantMessage, proposals: [] };
  }

  private buildSystemPrompt(memory: CompanyMemory, latestAnalysis: any): string {
    let osContext = '';
    try { osContext = buildOSContext(); } catch { /* ignore */ }

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

    if (memory.companyName) {
      prompt += `\n【この会社の情報（記憶済み）】\n`;
      if (memory.companyName) prompt += `- 会社名: ${memory.companyName}\n`;
      if (memory.industry) prompt += `- 業種: ${memory.industry}\n`;
      if (memory.employeeCount) prompt += `- 従業員数: ${memory.employeeCount}\n`;
      if (memory.fiscalYearEnd) prompt += `- 決算期: ${memory.fiscalYearEnd}\n`;
      if (memory.notes.length > 0) {
        prompt += `- その他の情報:\n`;
        memory.notes.forEach(n => { prompt += `  - ${n}\n`; });
      }
    }

    if (osContext) {
      prompt += `\n${osContext}\n`;
    }

    // freeeリアルタイムデータ
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
        if (ctx.bs.totalAssets > 0) {
          prompt += `- 自己資本比率: ${(ctx.bs.netAssets / ctx.bs.totalAssets * 100).toFixed(1)}%\n`;
        }
        if (ctx.bs.currentLiabilities > 0) {
          prompt += `- 流動比率: ${(ctx.bs.currentAssets / ctx.bs.currentLiabilities * 100).toFixed(1)}%\n`;
        }
      }
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
      if (a.simpleCashFlow !== null) {
        prompt += `- 簡易CF: ${new Intl.NumberFormat('ja-JP').format(a.simpleCashFlow)}円\n`;
      }
      prompt += `- 強み: ${r.positives.slice(0, 3).map((p: string) => p.split('：')[0]).join('、')}\n`;
      prompt += `- 課題: ${r.negatives.slice(0, 3).map((n: string) => n.split('：')[0]).join('、') || 'なし'}\n`;
    }

    return prompt;
  }

  /** 会話から会社情報を自動抽出して記憶 */
  private tryUpdateMemory(userMsg: string, _assistantMsg: string, memory: CompanyMemory): void {
    let updated = false;

    const companyMatch = userMsg.match(/(?:うちの会社は|弊社は|当社は|会社名は)(.+?)(?:です|だ|。|$)/);
    if (companyMatch && !memory.companyName) {
      memory.companyName = companyMatch[1].trim();
      updated = true;
    }

    const industryMatch = userMsg.match(/(?:業種は|業界は|事業は)(.+?)(?:です|だ|。|$)/);
    if (industryMatch && !memory.industry) {
      memory.industry = industryMatch[1].trim();
      updated = true;
    }

    const empMatch = userMsg.match(/(?:従業員|社員|スタッフ).*?(\d+).*?(?:人|名)/);
    if (empMatch && !memory.employeeCount) {
      memory.employeeCount = empMatch[1] + '人';
      updated = true;
    }

    const fyMatch = userMsg.match(/(?:決算|決算期|決算月).*?(\d{1,2})月/);
    if (fyMatch && !memory.fiscalYearEnd) {
      memory.fiscalYearEnd = fyMatch[1] + '月';
      updated = true;
    }

    if (updated) {
      this.saveMemory(memory);
      logger.info('会社情報メモリを更新しました');
    }
  }
}

export const chatService = new ChatService();
