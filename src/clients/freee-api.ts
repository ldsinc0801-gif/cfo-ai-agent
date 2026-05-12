import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/index.js';
import { FreeeAuthClient } from './freee-auth.js';
import { logger } from '../utils/logger.js';
import type {
  FreeeCompaniesResponse,
  FreeeAccountItemsResponse,
  FreeePLResponse,
  FreeeBSResponse,
  FreeeTransactionsResponse,
} from '../types/freee.js';

/**
 * freee APIクライアント
 *
 * 各エンドポイントへのアクセスを提供する。
 * 認証エラー時は自動でトークンリフレッシュを試行する。
 */
export class FreeeApiClient {
  private client: AxiosInstance;
  private auth: FreeeAuthClient;
  private retryCount = 0;
  private maxRetries = 1;

  constructor(auth: FreeeAuthClient) {
    this.auth = auth;
    this.client = axios.create({
      baseURL: config.freee.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((reqConfig) => {
      reqConfig.headers.Authorization = `Bearer ${this.auth.getAccessToken()}`;
      return reqConfig;
    });
  }

  /** 認証エラー時にリトライ */
  private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      this.retryCount = 0;
      return await fn();
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401 && this.retryCount < this.maxRetries) {
        logger.warn('認証エラー。トークンを更新して再試行します...');
        this.retryCount++;
        await this.auth.refreshAccessToken();
        return fn();
      }
      throw this.handleApiError(error);
    }
  }

  private handleApiError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data?.message || error.message;
      const errors = data?.errors ? JSON.stringify(data.errors) : '';
      const detail = errors ? `${message} [${errors}]` : message;

      switch (status) {
        case 400:
          logger.error(`freee API 400エラー詳細:`, { message, errors: data?.errors, body: error.config?.data });
          return new FreeeApiError(`リクエストが不正です: ${detail}`, status);
        case 401:
          return new FreeeApiError('認証に失敗しました。トークンを再取得してください。', status);
        case 403:
          return new FreeeApiError('このリソースへのアクセス権限がありません。', status);
        case 404:
          return new FreeeApiError('指定されたリソースが見つかりません。', status);
        case 429:
          return new FreeeApiError('APIレート制限に達しました。しばらく待ってから再実行してください。', status);
        case 500:
        case 503:
          return new FreeeApiError('freeeサーバーでエラーが発生しました。しばらく待ってから再実行してください。', status);
        default:
          return new FreeeApiError(`API呼び出しエラー (${status}): ${message}`, status);
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /** 事業所詳細を取得（会計年度情報を含む） */
  async getCompanyDetail(companyId: number): Promise<any> {
    return this.requestWithRetry(async () => {
      logger.info('事業所詳細を取得中...');
      const response = await this.client.get(`/api/1/companies/${companyId}`);
      return response.data.company;
    });
  }

  /** 事業所一覧を取得 */
  async getCompanies(): Promise<FreeeCompaniesResponse> {
    return this.requestWithRetry(async () => {
      logger.info('事業所一覧を取得中...');
      const response = await this.client.get<FreeeCompaniesResponse>('/api/1/companies');
      logger.info(`${response.data.companies.length}件の事業所を取得しました`);
      return response.data;
    });
  }

  /** 勘定科目一覧を取得 */
  async getAccountItems(companyId: number): Promise<FreeeAccountItemsResponse> {
    return this.requestWithRetry(async () => {
      logger.info('勘定科目一覧を取得中...');
      const response = await this.client.get<FreeeAccountItemsResponse>(
        '/api/1/account_items',
        { params: { company_id: companyId } }
      );
      logger.info(`${response.data.account_items.length}件の勘定科目を取得しました`);
      return response.data;
    });
  }

  /**
   * 事業所固有の税区分一覧を取得。
   * freee API: GET /api/1/taxes/companies/{company_id}
   * 課税仕入/課税売上を区別した正確な tax_code を取得するために使用する。
   */
  async getTaxCodes(companyId: number): Promise<Array<{ code: number; name: string; display_category: string }>> {
    return this.requestWithRetry(async () => {
      const response = await this.client.get<{ taxes: Array<{ code: number; name: string; display_category: string }> }>(
        `/api/1/taxes/companies/${companyId}`,
      );
      return response.data.taxes || [];
    });
  }

  /**
   * 取引種別(income/expense)と税率(10/8/0)から、その事業所の正しい tax_code を解決する。
   * 「課対仕入10%」「課対売上10%」のような名前で検索することで、テナント固有のコードでも正しく動く。
   * 見つからなければ 0（対象外）を返す。
   */
  async findTaxCode(companyId: number, dealType: 'income' | 'expense', rate: number): Promise<number> {
    try {
      const taxes = await this.getTaxCodes(companyId);
      const side = dealType === 'income' ? ['課税売上', '課対売上'] : ['課税仕入', '課対仕入'];
      const matches = taxes.filter(t => side.some(k => t.name.includes(k)));
      // 軽減税率「軽」付き、対象外、を除外しつつ、率（%）を含むものを優先
      let target: { code: number; name: string } | undefined;
      if (rate === 8) {
        target = matches.find(t => t.name.includes('8%') && (t.name.includes('軽') || t.name.includes('軽減')));
      } else if (rate === 10) {
        target = matches.find(t => t.name.includes('10%') && !t.name.includes('軽'));
      } else if (rate === 0) {
        target = taxes.find(t => t.name === '対象外' || t.name.includes('不課税'));
      }
      if (!target) target = matches.find(t => t.name.includes(`${rate}%`));
      if (target) {
        logger.info(`税区分マッチ: ${dealType} ${rate}% → ${target.name} (code=${target.code})`);
        return target.code;
      }
      logger.warn(`税区分が見つかりません: ${dealType} ${rate}%、対象外(0)で送信`);
      return 0;
    } catch (e) {
      logger.warn('税区分取得に失敗、フォールバック値を使用', e);
      // フォールバック: freee標準値
      if (dealType === 'expense') return rate === 10 ? 21 : rate === 8 ? 23 : 0;
      return rate === 10 ? 11 : rate === 8 ? 12 : 0;
    }
  }

  /**
   * 試算表（損益計算書）を取得
   *
   * freee API: GET /api/1/reports/trial_pl
   * 指定期間のPLデータを返す
   */
  async getTrialPL(
    companyId: number,
    fiscalYear: number,
    startMonth: number,
    endMonth: number
  ): Promise<FreeePLResponse> {
    return this.requestWithRetry(async () => {
      logger.info(`試算表(PL)を取得中... (${fiscalYear}年 ${startMonth}月〜${endMonth}月)`);
      const response = await this.client.get<FreeePLResponse>(
        '/api/1/reports/trial_pl',
        {
          params: {
            company_id: companyId,
            fiscal_year: fiscalYear,
            start_month: startMonth,
            end_month: endMonth,
          },
        }
      );
      return response.data;
    });
  }

  /**
   * 試算表（貸借対照表）を取得
   *
   * freee API: GET /api/1/reports/trial_bs
   */
  async getTrialBS(
    companyId: number,
    fiscalYear: number,
    startMonth: number,
    endMonth: number
  ): Promise<FreeeBSResponse> {
    return this.requestWithRetry(async () => {
      logger.info(`試算表(BS)を取得中... (${fiscalYear}年 ${startMonth}月〜${endMonth}月)`);
      const response = await this.client.get<FreeeBSResponse>(
        '/api/1/reports/trial_bs',
        {
          params: {
            company_id: companyId,
            fiscal_year: fiscalYear,
            start_month: startMonth,
            end_month: endMonth,
          },
        }
      );
      return response.data;
    });
  }

  /**
   * 取引一覧を取得
   *
   * freee API: GET /api/1/deals
   * ページネーション対応
   */
  async getTransactions(
    companyId: number,
    params: {
      startDate?: string;
      endDate?: string;
      type?: 'income' | 'expense';
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<FreeeTransactionsResponse> {
    return this.requestWithRetry(async () => {
      logger.info('取引一覧を取得中...');
      const response = await this.client.get<FreeeTransactionsResponse>(
        '/api/1/deals',
        {
          params: {
            company_id: companyId,
            start_issue_date: params.startDate,
            end_issue_date: params.endDate,
            type: params.type,
            offset: params.offset || 0,
            limit: params.limit || 100,
          },
        }
      );
      logger.info(`${response.data.deals.length}件の取引を取得しました（全${response.data.meta.total_count}件）`);
      return response.data;
    });
  }

  /**
   * 口座一覧を取得
   *
   * freee API: GET /api/1/walletables
   */
  async getWalletables(companyId: number): Promise<any[]> {
    return this.requestWithRetry(async () => {
      logger.info('口座一覧を取得中...');
      const response = await this.client.get('/api/1/walletables', {
        params: { company_id: companyId },
      });
      return response.data.walletables || [];
    });
  }

  /**
   * 貸方勘定科目名からfreeeの口座（walletable）を検索
   *
   * 「現金」→ wallet type: wallet
   * 「普通預金」等の銀行口座 → wallet type: bank_account
   * 見つからない場合はnull（未決済として登録）
   */
  async findWalletable(companyId: number, creditAccountName: string): Promise<{ id: number; type: string } | null> {
    const walletables = await this.getWalletables(companyId);

    // 完全一致を優先、次に部分一致
    let match = walletables.find((w: any) => w.name === creditAccountName);
    if (!match) {
      match = walletables.find((w: any) =>
        creditAccountName.includes(w.name) || w.name.includes(creditAccountName)
      );
    }
    // 「現金」の場合はwalletタイプの口座を探す
    if (!match && creditAccountName === '現金') {
      match = walletables.find((w: any) => w.type === 'wallet');
    }

    return match ? { id: match.id, type: match.type } : null;
  }

  /**
   * 取引（収入/支出）を登録
   *
   * freee API: POST /api/1/deals
   * payments を含めると決済済み（貸方が口座）として登録される
   */
  async createDeal(
    companyId: number,
    params: {
      issue_date: string;
      type: 'income' | 'expense';
      details: {
        account_item_id: number;
        tax_code: number;
        amount: number;
        description?: string;
      }[];
      payments?: {
        amount: number;
        from_walletable_id: number;
        from_walletable_type: string;
        date: string;
      }[];
      ref_number?: string;
    }
  ): Promise<any> {
    return this.requestWithRetry(async () => {
      logger.info(`取引を登録中... (${params.type}, ${params.issue_date})`);
      const body: any = {
        company_id: companyId,
        issue_date: params.issue_date,
        type: params.type,
        details: params.details,
        ref_number: params.ref_number,
      };
      if (params.payments && params.payments.length > 0) {
        body.payments = params.payments;
      }
      const response = await this.client.post('/api/1/deals', body);
      logger.info('取引を登録しました');
      return response.data;
    });
  }

  /**
   * レシート画像をファイルボックスにアップロード
   *
   * freee API: POST /api/1/receipts
   * multipart/form-data でファイルを送信
   */
  async uploadReceipt(
    companyId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<number> {
    return this.requestWithRetry(async () => {
      logger.info(`レシートをアップロード中... (${fileName})`);

      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('company_id', String(companyId));
      form.append('receipt', fileBuffer, {
        filename: fileName,
        contentType: mimeType,
      });

      const response = await this.client.post('/api/1/receipts', form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${this.auth.getAccessToken()}`,
        },
      });

      const receiptId = response.data?.receipt?.id;
      if (!receiptId) {
        throw new Error('レシートIDが取得できませんでした');
      }
      logger.info(`レシートアップロード完了 (receipt_id: ${receiptId})`);
      return receiptId;
    });
  }

  /**
   * レシートを取引に紐付け
   *
   * freee API: PUT /api/1/deals/{id}
   * receipt_ids で紐付け
   */
  async linkReceiptToDeal(
    companyId: number,
    dealId: number,
    receiptId: number
  ): Promise<void> {
    return this.requestWithRetry(async () => {
      logger.info(`レシートを取引に紐付け中... (deal_id: ${dealId}, receipt_id: ${receiptId})`);
      await this.client.put(`/api/1/deals/${dealId}`, {
        company_id: companyId,
        receipt_ids: [receiptId],
      });
      logger.info('レシート紐付け完了');
    });
  }

  /**
   * 勘定科目名からIDを検索
   */
  async findAccountItemId(companyId: number, accountName: string): Promise<number | null> {
    const data = await this.getAccountItems(companyId);
    const item = data.account_items.find(
      (a: any) => a.name === accountName || a.shortcut1 === accountName
    );
    return item ? item.id : null;
  }
}

export class FreeeApiError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'FreeeApiError';
    this.statusCode = statusCode;
  }
}
