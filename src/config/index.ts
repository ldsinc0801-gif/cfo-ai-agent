import dotenv from 'dotenv';
dotenv.config();

export const config = {
  freee: {
    clientId: process.env.FREEE_CLIENT_ID || '',
    clientSecret: process.env.FREEE_CLIENT_SECRET || '',
    redirectUri: process.env.FREEE_REDIRECT_URI || 'http://localhost:3000/callback',
    accessToken: process.env.FREEE_ACCESS_TOKEN || '',
    refreshToken: process.env.FREEE_REFRESH_TOKEN || '',
    companyId: process.env.FREEE_COMPANY_ID ? Number(process.env.FREEE_COMPANY_ID) : null,
    baseUrl: 'https://api.freee.co.jp',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'template') as 'template' | 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    chatModel: process.env.CHAT_MODEL || 'gpt-4o',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  output: {
    dir: process.env.OUTPUT_DIR || './output',
    format: (process.env.OUTPUT_FORMAT || 'both') as 'json' | 'markdown' | 'both',
  },
} as const;

/** 異常検知しきい値 */
export const thresholds = {
  /** 前月比増減率のしきい値（費用科目） */
  expenseChangeRate: 0.3,
  /** 売上急減のしきい値 */
  revenueDropRate: -0.2,
  /** 現預金減少のしきい値 */
  cashDeclineRate: -0.2,
  /** 固定費率のしきい値（対売上） */
  fixedCostRatio: 0.7,
  /** 特定科目集中のしきい値（対総費用） */
  concentrationRatio: 0.4,
} as const;

/** 評価しきい値 */
export const evaluationThresholds = {
  profit: {
    excellent: 0.10,   // 経常利益率10%以上
    good: 0.05,        // 5%以上
    fair: 0.02,        // 2%以上
    warning: 0,        // 0%以上
    // warning未満 = critical
  },
  currentRatio: {
    excellent: 200,
    good: 150,
    fair: 120,
    warning: 100,
  },
  equityRatio: {
    excellent: 50,
    good: 30,
    fair: 20,
    warning: 10,
  },
  cashMonths: {
    excellent: 6,
    good: 3,
    fair: 2,
    warning: 1,
  },
  debtRepaymentYears: {
    excellent: 5,
    good: 10,
    fair: 15,
    warning: 20,
  },
} as const;
