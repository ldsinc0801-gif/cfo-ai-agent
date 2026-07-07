import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiptService } from '../../../src/services/receipt-service.js';

// Gemini (Vertex AI, @google/genai) モック
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = { generateContent: mockGenerateContent };
    },
  };
});

// config モック（Vertex AI: gcpProject を設定済みにする）
vi.mock('../../../src/config/index.js', () => ({
  config: {
    ai: { gcpProject: 'test-project', geminiRegion: 'us-central1', geminiModel: 'gemini-2.0-flash' },
  },
}));

// logger モック
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// usageTracker モック
vi.mock('../../../src/services/usage-tracker.js', () => ({
  usageTracker: { record: vi.fn() },
}));

// account-rules モック
vi.mock('../../../src/config/account-rules.js', () => ({
  accountRulesToPrompt: () => '旅費交通費: 電車・バス・タクシー',
}));

// journal-learning-service モック
vi.mock('../../../src/services/journal-learning-service.js', () => ({
  journalLearningService: {
    getLearnedRulesForPrompt: vi.fn().mockResolvedValue(''),
    recordCorrection: vi.fn().mockResolvedValue(undefined),
  },
}));

// @google/genai の generateContent が返すレスポンス（response.text は文字列プロパティ）
function makeGeminiResponse(json: object) {
  return {
    text: '```json\n' + JSON.stringify(json) + '\n```',
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
  };
}

// 生テキストのレスポンス（parseResponse の直接検証用）
function makeRawResponse(text: string) {
  return { text, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
}

// コンストラクタは import('@google/genai') を非同期解決してから this.ai をセットするため、
// 初期化完了(isAvailable=true)まで待つ。
async function waitForInit(s: ReceiptService): Promise<void> {
  for (let i = 0; i < 100 && !s.isAvailable(); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('ReceiptService', () => {
  let service: ReceiptService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new ReceiptService();
    await waitForInit(service);
  });

  describe('analyzeVideo', () => {
    it('動画バッファをbase64変換してGeminiに送信し、仕訳データを返す', async () => {
      const mockResult = makeGeminiResponse({
        entries: [
          {
            date: '2026-03-15',
            debitAccount: '会議費',
            creditAccount: '現金',
            amount: 3500,
            taxRate: 10,
            taxAmount: 318,
            description: 'ランチミーティング',
            partnerName: 'カフェABC',
            receiptType: 'レシート',
          },
          {
            date: '2026-03-15',
            debitAccount: '旅費交通費',
            creditAccount: '現金',
            amount: 1200,
            taxRate: 10,
            taxAmount: 109,
            description: 'タクシー代',
            partnerName: '東京タクシー',
            receiptType: '領収書',
          },
        ],
        confidence: 'high',
        notes: ['動画から2枚のレシートを検出'],
      });

      mockGenerateContent.mockResolvedValueOnce(mockResult);

      const videoBuffer = Buffer.from('fake-video-data');
      const result = await service.analyzeVideo(videoBuffer, 'video/mp4', 'test.mp4');

      // Geminiに正しく送信されたか（contents[0].parts に inlineData + text）
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const parts = callArgs.contents[0].parts;
      expect(parts).toHaveLength(2);
      // inlineData にbase64エンコードされた動画データが含まれる
      expect(parts[0].inlineData.mimeType).toBe('video/mp4');
      expect(parts[0].inlineData.data).toBe(videoBuffer.toString('base64'));
      // プロンプトテキストが含まれる
      expect(parts[1].text).toContain('領収書');

      // レスポンスが正しくパースされたか
      expect(result.entries).toHaveLength(2);
      expect(result.confidence).toBe('high');
      expect(result.entries[0].debitAccount).toBe('会議費');
      expect(result.entries[0].amount).toBe(3500);
      expect(result.entries[1].debitAccount).toBe('旅費交通費');
      expect(result.entries[1].amount).toBe(1200);
    });

    it('Vertex AI未設定時にエラーをスローする', async () => {
      const noAiService = new ReceiptService();
      // クライアント未初期化状態を再現
      (noAiService as any).ai = null;

      await expect(
        noAiService.analyzeVideo(Buffer.from('test'), 'video/mp4', 'test.mp4'),
      ).rejects.toThrow('GOOGLE_CLOUD_PROJECTが未設定です');
    });

    it('業種指定時に学習ルールをプロンプトに含める', async () => {
      const { journalLearningService } = await import('../../../src/services/journal-learning-service.js');
      vi.mocked(journalLearningService.getLearnedRulesForPrompt).mockResolvedValueOnce(
        '【飲食業の学習済み仕訳ルール】\n- 食材仕入れは「仕入高」で計上する',
      );

      mockGenerateContent.mockResolvedValueOnce(
        makeGeminiResponse({ entries: [], confidence: 'medium', notes: [] }),
      );

      await service.analyzeVideo(Buffer.from('test'), 'video/mp4', 'test.mp4', '飲食業');

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[1].text;
      expect(promptText).toContain('学習済み仕訳ルール');
      expect(promptText).toContain('仕入高');
    });
  });

  describe('analyzeVideoFrames', () => {
    it('複数画像をGeminiに一括送信して仕訳データを返す', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        makeGeminiResponse({
          entries: [
            {
              date: '2026-03-20',
              debitAccount: '消耗品費',
              creditAccount: '現金',
              amount: 5000,
              taxRate: 10,
              taxAmount: 454,
              description: '文房具購入',
              partnerName: '文具店',
              receiptType: 'レシート',
            },
          ],
          confidence: 'medium',
          notes: [],
        }),
      );

      const frames = [
        { buffer: Buffer.from('frame1'), mimeType: 'image/jpeg' },
        { buffer: Buffer.from('frame2'), mimeType: 'image/jpeg' },
        { buffer: Buffer.from('frame3'), mimeType: 'image/jpeg' },
      ];

      const result = await service.analyzeVideoFrames(frames);

      // 全フレーム + プロンプトで合計4パーツ送信
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const parts = callArgs.contents[0].parts;
      expect(parts).toHaveLength(4); // 3 frames + 1 text
      expect(parts[0].inlineData.mimeType).toBe('image/jpeg');
      expect(parts[2].inlineData.data).toBe(Buffer.from('frame3').toString('base64'));

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].debitAccount).toBe('消耗品費');
    });
  });

  describe('parseResponse（レスポンス解析）', () => {
    // parseResponseはprivateなので、analyzeVideoを通じてテスト

    it('JSONブロック内のレスポンスを正しくパースする', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        makeRawResponse(
          'テキスト前文\n```json\n{"entries":[{"date":"2026-01-01","debitAccount":"旅費交通費","creditAccount":"現金","amount":1000,"taxRate":10,"taxAmount":91,"description":"電車代","partnerName":"JR","receiptType":"領収書"}],"confidence":"high","notes":[]}\n```\nテキスト後文',
        ),
      );

      const result = await service.analyzeVideo(Buffer.from('test'), 'video/mp4', 'test.mp4');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].date).toBe('2026-01-01');
    });

    it('不正なレスポンスでもクラッシュせずデフォルト値を返す', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        makeRawResponse('これはJSONではないテキストです。読み取れませんでした。'),
      );

      const result = await service.analyzeVideo(Buffer.from('test'), 'video/mp4', 'test.mp4');
      expect(result.entries).toHaveLength(0);
      expect(result.confidence).toBe('low');
      expect(result.notes).toContain('AIレスポンスの解析に失敗しました');
    });

    it('部分的に欠落したフィールドにデフォルト値が設定される', async () => {
      mockGenerateContent.mockResolvedValueOnce(
        makeGeminiResponse({
          entries: [{ amount: 500 }], // 最小限のフィールドのみ
          confidence: 'low',
          notes: ['読み取り困難'],
        }),
      );

      const result = await service.analyzeVideo(Buffer.from('test'), 'video/mp4', 'test.mp4');
      const entry = result.entries[0];
      expect(entry.amount).toBe(500);
      expect(entry.debitAccount).toBe('未分類');
      expect(entry.creditAccount).toBe('現金');
      expect(entry.taxRate).toBe(10);
      expect(entry.description).toBe('');
      expect(entry.receiptType).toBe('領収書');
    });
  });

  describe('toCSV / toYayoiCSV', () => {
    const entries = [
      {
        date: '2026-03-15',
        debitAccount: '会議費',
        creditAccount: '現金',
        amount: 3500,
        taxRate: 10,
        taxAmount: 318,
        description: 'ランチミーティング',
        partnerName: 'カフェABC',
        receiptType: 'レシート',
      },
    ];

    it('CSV形式で正しく出力される', () => {
      const csv = service.toCSV(entries);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('日付,借方勘定科目');
      expect(lines[1]).toContain('2026-03-15');
      expect(lines[1]).toContain('会議費');
      expect(lines[1]).toContain('3500');
    });

    it('弥生CSV形式で日付が変換される', () => {
      const csv = service.toYayoiCSV(entries);
      const lines = csv.split('\n');
      expect(lines[1]).toContain('2026年3月15日');
      expect(lines[1]).toContain('カフェABC ランチミーティング');
      // 経費なのでマイナス
      expect(lines[1]).toContain('-3500');
    });
  });

  describe('recordJournalCorrection', () => {
    it('学習サービスにデリゲートされる', async () => {
      const { journalLearningService } = await import('../../../src/services/journal-learning-service.js');

      const original = {
        date: '2026-03-15', debitAccount: '雑費', creditAccount: '現金',
        amount: 3500, taxRate: 10, taxAmount: 318,
        description: 'ランチ', partnerName: 'カフェ', receiptType: 'レシート',
      };
      const corrected = { ...original, debitAccount: '会議費' };

      await service.recordJournalCorrection(original, corrected, '飲食業', '打ち合わせのため');

      expect(journalLearningService.recordCorrection).toHaveBeenCalledWith(
        original, corrected, '飲食業', '打ち合わせのため',
      );
    });
  });
});
