import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const TEMPLATES_DIR = path.resolve('data/secretary/templates');
const DOCUMENTS_DIR = path.resolve('data/secretary/documents');
const COMPANY_SETTINGS_PATH = path.resolve('data/secretary/company-settings.json');

// ディレクトリ初期化
for (const dir of [TEMPLATES_DIR, DOCUMENTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 会社情報・振込先情報の設定 */
export interface CompanySettings {
  companyName: string;
  postalCode: string;
  address: string;
  representative: string;
  registrationNumber: string;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

export function loadCompanySettings(): CompanySettings | null {
  if (!fs.existsSync(COMPANY_SETTINGS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(COMPANY_SETTINGS_PATH, 'utf-8'));
  } catch { return null; }
}

export function saveCompanySettings(settings: CompanySettings): void {
  fs.writeFileSync(COMPANY_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export type DocumentType = 'invoice' | 'contract' | 'estimate' | 'application';

export interface TemplateField {
  key: string;
  label: string;
  x: number;       // % from left
  y: number;       // % from top
  fontSize: number;
  width: number;   // % width
  type: 'text' | 'number' | 'date' | 'lines'; // linesは明細行
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  templateFile: string;
  fields: TemplateField[];
  createdAt: string;
}

export interface GeneratedDocument {
  id: string;
  templateId: string;
  templateName: string;
  type: DocumentType;
  data: Record<string, any>;
  pdfPath: string;
  createdAt: string;
}

/** 書類タイプ別のデフォルトフィールド */
const DEFAULT_FIELDS: Record<DocumentType, TemplateField[]> = {
  invoice: [
    { key: 'customerName', label: '宛名', x: 5, y: 12, fontSize: 16, width: 40, type: 'text' },
    { key: 'invoiceDate', label: '請求日', x: 70, y: 12, fontSize: 12, width: 25, type: 'date' },
    { key: 'invoiceNo', label: '請求書番号', x: 70, y: 17, fontSize: 12, width: 25, type: 'text' },
    { key: 'dueDate', label: '支払期限', x: 70, y: 22, fontSize: 12, width: 25, type: 'date' },
    { key: 'lines', label: '明細', x: 5, y: 35, fontSize: 11, width: 90, type: 'lines' },
    { key: 'subtotal', label: '小計', x: 70, y: 75, fontSize: 12, width: 25, type: 'number' },
    { key: 'tax', label: '消費税', x: 70, y: 80, fontSize: 12, width: 25, type: 'number' },
    { key: 'total', label: '合計金額', x: 70, y: 85, fontSize: 16, width: 25, type: 'number' },
    { key: 'bankInfo', label: '振込先', x: 5, y: 88, fontSize: 10, width: 60, type: 'text' },
    { key: 'notes', label: '備考', x: 5, y: 93, fontSize: 10, width: 90, type: 'text' },
  ],
  estimate: [
    { key: 'customerName', label: '宛名', x: 5, y: 12, fontSize: 16, width: 40, type: 'text' },
    { key: 'estimateDate', label: '見積日', x: 70, y: 12, fontSize: 12, width: 25, type: 'date' },
    { key: 'estimateNo', label: '見積番号', x: 70, y: 17, fontSize: 12, width: 25, type: 'text' },
    { key: 'validUntil', label: '有効期限', x: 70, y: 22, fontSize: 12, width: 25, type: 'date' },
    { key: 'lines', label: '明細', x: 5, y: 35, fontSize: 11, width: 90, type: 'lines' },
    { key: 'subtotal', label: '小計', x: 70, y: 75, fontSize: 12, width: 25, type: 'number' },
    { key: 'tax', label: '消費税', x: 70, y: 80, fontSize: 12, width: 25, type: 'number' },
    { key: 'total', label: '合計金額', x: 70, y: 85, fontSize: 16, width: 25, type: 'number' },
    { key: 'notes', label: '備考', x: 5, y: 90, fontSize: 10, width: 90, type: 'text' },
  ],
  contract: [
    { key: 'customerName', label: '契約先', x: 5, y: 12, fontSize: 16, width: 40, type: 'text' },
    { key: 'contractDate', label: '契約日', x: 70, y: 12, fontSize: 12, width: 25, type: 'date' },
    { key: 'contractNo', label: '契約番号', x: 70, y: 17, fontSize: 12, width: 25, type: 'text' },
    { key: 'content', label: '契約内容', x: 5, y: 30, fontSize: 12, width: 90, type: 'text' },
    { key: 'amount', label: '契約金額', x: 5, y: 50, fontSize: 14, width: 40, type: 'number' },
    { key: 'period', label: '契約期間', x: 5, y: 56, fontSize: 12, width: 40, type: 'text' },
    { key: 'notes', label: '特記事項', x: 5, y: 65, fontSize: 10, width: 90, type: 'text' },
  ],
  application: [
    { key: 'customerName', label: '申込者名', x: 5, y: 12, fontSize: 16, width: 40, type: 'text' },
    { key: 'applicationDate', label: '申込日', x: 70, y: 12, fontSize: 12, width: 25, type: 'date' },
    { key: 'serviceName', label: 'サービス名', x: 5, y: 25, fontSize: 14, width: 90, type: 'text' },
    { key: 'plan', label: 'プラン', x: 5, y: 32, fontSize: 12, width: 40, type: 'text' },
    { key: 'amount', label: '金額', x: 50, y: 32, fontSize: 14, width: 40, type: 'number' },
    { key: 'startDate', label: '開始日', x: 5, y: 40, fontSize: 12, width: 40, type: 'date' },
    { key: 'notes', label: '備考', x: 5, y: 50, fontSize: 10, width: 90, type: 'text' },
  ],
};

export class SecretaryService {

  /** テンプレート一覧 */
  listTemplates(): DocumentTemplate[] {
    if (!fs.existsSync(TEMPLATES_DIR)) return [];
    return fs.readdirSync(TEMPLATES_DIR)
      .filter(d => fs.existsSync(path.join(TEMPLATES_DIR, d, 'metadata.json')))
      .map(d => JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, d, 'metadata.json'), 'utf-8')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** テンプレート取得 */
  getTemplate(id: string): DocumentTemplate | null {
    const metaPath = path.join(TEMPLATES_DIR, id, 'metadata.json');
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  /** テンプレート作成（非同期: プレビュー画像生成のため） */
  async createTemplate(name: string, type: DocumentType, uploadedFile: string): Promise<DocumentTemplate> {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const dir = path.join(TEMPLATES_DIR, id);
    fs.mkdirSync(dir, { recursive: true });

    let templateFile = '';

    if (uploadedFile && fs.existsSync(uploadedFile)) {
      const ext = path.extname(uploadedFile).toLowerCase();
      const destFile = `template${ext}`;
      fs.copyFileSync(uploadedFile, path.join(dir, destFile));
      templateFile = destFile;

      // PDFの場合: converted.pdfとしてもコピー（pdf-lib方式で使用）
      if (ext === '.pdf') {
        fs.copyFileSync(uploadedFile, path.join(dir, 'converted.pdf'));
      }

      // プレビュー画像を生成（表示用）
      try {
        await this.generatePreviewImage(path.join(dir, destFile), dir);
        // PDF/Excel/Wordの場合は元ファイルを維持
        if (!['.xlsx', '.xls', '.doc', '.docx', '.pdf'].includes(ext)) {
          templateFile = 'preview.png';
        }
      } catch (e) {
        logger.warn(`プレビュー画像生成をスキップ: ${e instanceof Error ? e.message : e}`);
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
          templateFile = destFile;
        }
      }

      // PDFレイアウト座標を自動検出して保存
      const convertedPdf = path.join(dir, 'converted.pdf');
      if (fs.existsSync(convertedPdf)) {
        try {
          const layout = this.detectPdfLayout(convertedPdf);
          fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(layout, null, 2));
          logger.info(`PDFレイアウト検出完了: ${Object.keys(layout).length}項目`);
        } catch (e) {
          logger.warn(`PDFレイアウト検出スキップ: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    const template: DocumentTemplate = {
      id,
      name,
      type,
      templateFile,
      fields: DEFAULT_FIELDS[type] || [],
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(template, null, 2));
    logger.info(`テンプレート作成: ${name} (${type})`);
    return template;
  }

  /** アップロードされたファイルからプレビュー画像（PNG）を生成 */
  private async generatePreviewImage(filePath: string, outDir: string): Promise<void> {
    const { execSync } = await import('child_process');
    const ext = path.extname(filePath).toLowerCase();
    const previewPath = path.join(outDir, 'preview.png');

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      fs.copyFileSync(filePath, previewPath);
      return;
    }

    // Excel/Word → まずPDFに変換
    let pdfPath = filePath;
    if (['.xlsx', '.xls', '.doc', '.docx'].includes(ext)) {
      pdfPath = path.join(outDir, 'converted.pdf');
      const converted = this.officeToPdf(filePath, pdfPath, execSync);
      if (!converted) {
        throw new Error('Excel/Word→PDF変換に失敗しました。LibreOfficeをインストールしてください。');
      }
    }

    // PDF → pdftoppmで画像に変換
    if (ext === '.pdf' || fs.existsSync(path.join(outDir, 'converted.pdf'))) {
      const outPrefix = path.join(outDir, 'preview');
      try {
        execSync(`pdftoppm -png -f 1 -l 1 -r 200 "${pdfPath}" "${outPrefix}"`, {
          timeout: 15000,
          stdio: 'pipe',
        });
        // pdftoppmは preview-1.png のような名前で出力する
        const generated = fs.readdirSync(outDir).find(f => f.startsWith('preview-') && f.endsWith('.png'));
        if (generated) {
          fs.renameSync(path.join(outDir, generated), previewPath);
          logger.info(`プレビュー画像を生成: ${previewPath}`);
          return;
        }
        // preview.png で出力される場合もある
        if (fs.existsSync(previewPath)) return;
      } catch (e) {
        logger.warn(`pdftoppmでの変換に失敗: ${e instanceof Error ? e.message : e}`);
      }
      throw new Error('PDF→画像変換に失敗しました');
    }

    throw new Error(`未対応のファイル形式: ${ext}`);
  }

  /** Office (Excel/Word) → PDF変換 */
  private officeToPdf(inputPath: string, outputPath: string, execSync: Function): boolean {
    const outDir = path.dirname(outputPath);
    const sofficeCommands = [
      'soffice',
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/usr/bin/libreoffice',
    ];

    for (const cmd of sofficeCommands) {
      try {
        execSync(`"${cmd}" --headless --convert-to pdf --outdir "${outDir}" "${inputPath}"`, {
          timeout: 30000,
          stdio: 'pipe',
        });
        const baseName = path.basename(inputPath, path.extname(inputPath));
        const generatedPdf = path.join(outDir, `${baseName}.pdf`);
        if (fs.existsSync(generatedPdf)) {
          fs.renameSync(generatedPdf, outputPath);
          return true;
        }
      } catch {
        continue;
      }
    }

    logger.warn('LibreOfficeが見つかりません');
    return false;
  }

  /** PDFからテキスト座標を検出してレイアウト情報を返す */
  private detectPdfLayout(pdfPath: string): Record<string, any> {
    const { execSync } = require('child_process');
    const bboxXml = execSync(`pdftotext -bbox "${pdfPath}" -`, {
      timeout: 10000, encoding: 'utf-8',
    });

    // XMLからword要素を抽出
    const words: Array<{ text: string; xMin: number; yMin: number; xMax: number; yMax: number }> = [];
    const wordRegex = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g;
    let m;
    while ((m = wordRegex.exec(bboxXml)) !== null) {
      words.push({
        xMin: parseFloat(m[1]), yMin: parseFloat(m[2]),
        xMax: parseFloat(m[3]), yMax: parseFloat(m[4]),
        text: m[5],
      });
    }

    // ページサイズ
    const pageMatch = bboxXml.match(/page width="([\d.]+)" height="([\d.]+)"/);
    const pageW = pageMatch ? parseFloat(pageMatch[1]) : 595.276;
    const pageH = pageMatch ? parseFloat(pageMatch[2]) : 841.89;

    const find = (keyword: string) => words.find(w => w.text.includes(keyword));
    const findAll = (keyword: string) => words.filter(w => w.text.includes(keyword));

    // キーワードベースで座標を検出
    const layout: Record<string, any> = { pageW, pageH };

    // pdftotext の yMin/yMax はページ上端からの距離
    // pdf-lib の y はページ下端からの距離（ベースライン）
    // 変換: y_pdflib ≈ pageH - yMax（テキスト底辺＝ベースライン付近）
    const toY = (yMax: number) => pageH - yMax;

    // 御中 → 宛名はその左側、同じ行に配置
    const onchu = find('御中');
    if (onchu) {
      layout.customerName = { x: 35, y: toY(onchu.yMax), anchor: 'left' };
    }

    // 日付（yyyy年）
    const dateWord = words.find(w => /\d{4}年/.test(w.text));
    if (dateWord) {
      layout.invoiceDate = { x: dateWord.xMin, y: toY(dateWord.yMax), anchor: 'left' };
    }

    // 件名
    const kenmei = find('件名');
    if (kenmei) {
      layout.subject = { x: kenmei.xMax + 5, y: toY(kenmei.yMax), anchor: 'left' };
    }

    // 有効期限
    const yuko = find('有効期限');
    if (yuko) {
      layout.dueDate = { x: yuko.xMax + 10, y: toY(yuko.yMax), anchor: 'left' };
    }

    // 合計金額（「合計金額」ラベルの右に値を配置）
    const goukei = find('合計金額') || find('合計⾦額');
    if (goukei) {
      layout.totalAmount = { x: goukei.xMax + 15, y: toY(goukei.yMax), anchor: 'left' };
    }

    // No. → 明細テーブルの開始
    const noHeader = find('No.');
    const amountHeaders = findAll('金額').concat(findAll('⾦額'));
    const amountHeader = amountHeaders.find(w => w.xMin > 400) || amountHeaders[amountHeaders.length - 1];
    const summaryHeader = find('摘要');

    if (noHeader) {
      // 明細1行目 = No.ヘッダーのyMaxからさらに行高さ分下
      const headerBottom = toY(noHeader.yMax);
      // テンプレートに「1」がある場合はその位置を使う
      const firstRow = words.find(w => w.text === '1' && w.yMin > noHeader.yMax && w.yMin < noHeader.yMax + 30);
      layout.detailStartY = firstRow ? toY(firstRow.yMax) : headerBottom - 13;
      layout.detailNoX = noHeader.xMin;
      layout.detailItemX = summaryHeader ? summaryHeader.xMin : noHeader.xMax + 20;
      layout.detailAmountRight = amountHeader ? amountHeader.xMax + 15 : 550;
    }

    // 消費税
    const tax = find('消費税');
    if (tax) {
      layout.taxY = toY(tax.yMax);
      layout.taxAmountRight = layout.detailAmountRight || 550;
    }

    // 合計（下段、消費税の下にある「合計」）
    const allTotals = findAll('合計');
    const totalBottom = allTotals.find(w => w.yMin > (tax?.yMin || 400) && !w.text.includes('金額') && !w.text.includes('⾦額'));
    if (totalBottom) {
      layout.grandTotalY = toY(totalBottom.yMax);
      layout.grandTotalRight = layout.detailAmountRight || 550;
    }

    // 備考
    const biko = find('備考');
    if (biko) {
      layout.notesX = biko.xMin;
      layout.notesY = toY(biko.yMax) - 15;
    }

    // 明細行の高さを計算
    if (layout.detailStartY && layout.taxY) {
      const detailSpan = layout.detailStartY - layout.taxY;
      layout.detailRowH = detailSpan / 12;
    }

    // 固定テキスト情報を抽出（振込先、会社名、備考内容等）
    const bankInfo: Record<string, string> = {};
    const bankLabels = ['金融機関名', '⾦融機関名', '支店名', '⽀店名', '預金種類', '預⾦種類', '口座番号', '⼝座番号', '口座名義', '⼝座名義'];
    for (const label of bankLabels) {
      const labelWord = find(label);
      if (labelWord) {
        // ラベルと同じ行（yMin差 < 5）で右側にあるテキストを結合
        const valueWords = words.filter(w =>
          Math.abs(w.yMin - labelWord.yMin) < 5 && w.xMin > labelWord.xMax
        ).sort((a, b) => a.xMin - b.xMin);
        const key = label.replace(/[⾦⽀預⾦⼝]/g, (c: string) => {
          const map: Record<string, string> = { '⾦': '金', '⽀': '支', '預': '預', '⼝': '口' };
          return map[c] || c;
        });
        bankInfo[key] = valueWords.map(w => w.text).join('');
      }
    }
    layout.bankInfo = bankInfo;

    // 備考内容
    if (biko) {
      const noteWords = words.filter(w => w.yMin > biko.yMax && w.yMin < biko.yMax + 30);
      layout.notesText = noteWords.map(w => w.text).join('');
    }

    // 会社情報（ページ下部）
    const companyWords = words.filter(w => w.yMin > 540);
    layout.companyInfo = companyWords.map(w => w.text).join(' ');

    // タイトル
    const title = find('御請求書') || find('御見積書') || find('請求書') || find('見積書');
    layout.title = title?.text || '';

    return layout;
  }

  /** テンプレート削除 */
  deleteTemplate(id: string): void {
    const dir = path.join(TEMPLATES_DIR, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
      logger.info(`テンプレート削除: ${id}`);
    }
  }

  /** フィールド位置を更新 */
  updateFields(id: string, fields: TemplateField[]): void {
    const template = this.getTemplate(id);
    if (!template) return;
    template.fields = fields;
    fs.writeFileSync(
      path.join(TEMPLATES_DIR, id, 'metadata.json'),
      JSON.stringify(template, null, 2),
    );
  }

  /** テンプレートファイルのパスを取得 */
  getTemplateFilePath(id: string): string | null {
    const template = this.getTemplate(id);
    if (!template) return null;
    return path.join(TEMPLATES_DIR, id, template.templateFile);
  }

  /** ドキュメントHTML生成（PDF変換前のHTML） */
  generateDocumentHTML(template: DocumentTemplate, data: Record<string, any>): string {
    const templateDir = path.join(TEMPLATES_DIR, template.id);
    const templateFilePath = path.join(templateDir, template.templateFile);
    const ext = path.extname(template.templateFile).toLowerCase();

    // 背景画像のdata URI（プレビュー画像 or 元画像を使用）
    let bgCSS = '';
    const previewPath = path.join(templateDir, 'preview.png');
    const bgFile = fs.existsSync(previewPath) ? previewPath : templateFilePath;
    const bgExt = path.extname(bgFile).toLowerCase();
    if (fs.existsSync(bgFile) && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(bgExt)) {
      const base64 = fs.readFileSync(bgFile).toString('base64');
      const mime = bgExt === '.png' ? 'image/png' : bgExt === '.jpg' || bgExt === '.jpeg' ? 'image/jpeg' : 'image/png';
      bgCSS = `background-image:url(data:${mime};base64,${base64});background-size:100% 100%;background-repeat:no-repeat;`;
    }

    const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);

    // フィールドを配置
    let fieldsHTML = '';
    for (const field of template.fields) {
      const value = data[field.key];
      if (value === undefined || value === null || value === '') continue;

      if (field.type === 'lines' && Array.isArray(value)) {
        // 明細行テーブル
        fieldsHTML += `<div style="position:absolute;left:${field.x}%;top:${field.y}%;width:${field.width}%;font-size:${field.fontSize}px">
          <table style="width:100%;border-collapse:collapse;font-size:${field.fontSize}px">
            <thead><tr style="background:#f0f0f0;border-bottom:2px solid #333">
              <th style="text-align:left;padding:6px;width:40%">品目</th>
              <th style="text-align:right;padding:6px;width:20%">単価</th>
              <th style="text-align:right;padding:6px;width:15%">数量</th>
              <th style="text-align:right;padding:6px;width:25%">金額</th>
            </tr></thead>
            <tbody>${(value as any[]).map(line => `<tr style="border-bottom:1px solid #ccc">
              <td style="padding:6px">${line.item || ''}</td>
              <td style="text-align:right;padding:6px">${fmt(line.unitPrice || 0)}円</td>
              <td style="text-align:right;padding:6px">${line.quantity || 0}</td>
              <td style="text-align:right;padding:6px">${fmt(line.amount || 0)}円</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      } else if (field.type === 'number') {
        const displayValue = typeof value === 'number' ? `¥${fmt(value)}` : value;
        fieldsHTML += `<div style="position:absolute;left:${field.x}%;top:${field.y}%;width:${field.width}%;font-size:${field.fontSize}px;font-weight:bold">
          <span style="color:#666;font-size:${field.fontSize - 2}px">${field.label}: </span>${displayValue}
        </div>`;
      } else {
        fieldsHTML += `<div style="position:absolute;left:${field.x}%;top:${field.y}%;width:${field.width}%;font-size:${field.fontSize}px">
          <span style="color:#666;font-size:${field.fontSize - 2}px">${field.label}: </span>${value}
        </div>`;
      }
    }

    // 会社名ヘッダー（テンプレートがない場合）
    const typeLabels: Record<DocumentType, string> = {
      invoice: '請求書', estimate: '見積書', contract: '契約書', application: '申込書',
    };

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; padding: 0; font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif; }
  .page { position: relative; width: 210mm; height: 297mm; ${bgCSS} padding: 15mm; box-sizing: border-box; }
  ${!bgCSS ? `.page::before { content: '${typeLabels[template.type]}'; display: block; text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; padding: 10px; border-bottom: 3px solid #2298ae; color: #2298ae; }` : ''}
</style>
</head>
<body><div class="page">${fieldsHTML}</div></body></html>`;
  }

  /** PDF生成 */
  async generatePDF(template: DocumentTemplate, data: Record<string, any>): Promise<GeneratedDocument> {
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pdfPath = path.join(DOCUMENTS_DIR, `${docId}.pdf`);

    const templateDir = path.join(TEMPLATES_DIR, template.id);
    const origExt = path.extname(template.templateFile).toLowerCase();

    // layout.jsonがある → HTML完全生成方式（フォント統一）
    const layoutPath = path.join(templateDir, 'layout.json');
    const convertedPdf = path.join(templateDir, 'converted.pdf');
    if (fs.existsSync(layoutPath) || fs.existsSync(convertedPdf)) {
      await this.generateFromHTMLFull(templateDir, template, data, pdfPath);
    } else if (['.xlsx', '.xls'].includes(origExt)) {
      await this.generateFromExcel(templateDir, template, data, pdfPath);
    } else {
      await this.generateFromHTML(template, data, pdfPath);
    }

    const doc: GeneratedDocument = {
      id: docId,
      templateId: template.id,
      templateName: template.name,
      type: template.type,
      data,
      pdfPath,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(DOCUMENTS_DIR, `${docId}.json`), JSON.stringify(doc, null, 2));
    logger.info(`PDF生成完了: ${docId} (${template.name})`);
    return doc;
  }

  /** HTMLで請求書を完全生成 → puppeteerでPDF化（フォント統一） */
  private async generateFromHTMLFull(
    templateDir: string,
    template: DocumentTemplate,
    data: Record<string, any>,
    pdfPath: string,
  ): Promise<void> {
    const puppeteer = await import('puppeteer');

    // layout.json から固定情報を読み込み（なければ再検出）
    const layoutPath = path.join(templateDir, 'layout.json');
    const convertedPdf = path.join(templateDir, 'converted.pdf');
    let L: Record<string, any>;
    if (fs.existsSync(layoutPath)) {
      L = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
    } else if (fs.existsSync(convertedPdf)) {
      L = this.detectPdfLayout(convertedPdf);
      fs.writeFileSync(layoutPath, JSON.stringify(L, null, 2));
    } else {
      L = {};
    }

    // 振込先: 会社設定 > layout.json の順で優先
    const cs = loadCompanySettings();
    const bankFromSettings = cs ? {
      '金融機関名': cs.bankName,
      '支店名': cs.branchName,
      '預金種類': cs.accountType,
      '口座番号': cs.accountNumber,
      '口座名義': cs.accountHolder,
    } : null;
    const bank = bankFromSettings || L.bankInfo || {};
    const fmt = (n: number) => '¥' + n.toLocaleString('ja-JP');
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // 日付フォーマット
    const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    };

    const invoiceDate = data.invoiceDate || data.estimateDate || '';
    const dueDate = data.dueDate || data.validUntil || '';

    // 明細行HTML
    const lines = data.lines || [];
    const detailRows = 12;
    let linesHTML = '';
    for (let i = 0; i < detailRows; i++) {
      const line = lines[i];
      if (line) {
        const amount = line.amount || (line.unitPrice || 0) * (line.quantity || 1);
        linesHTML += `<tr><td class="no">${i+1}</td><td class="item">${esc(line.item || '')}</td><td class="amt">${fmt(amount)}</td></tr>`;
      } else {
        linesHTML += `<tr><td class="no"></td><td class="item"></td><td class="amt"></td></tr>`;
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif; font-size: 10px; color: #222; }
.page { width: 210mm; min-height: 297mm; padding: 18mm 20mm 15mm 20mm; position: relative; }

.title { text-align: center; font-size: 13px; margin-bottom: 20px; }
.date { text-align: right; font-size: 10px; margin-bottom: 15px; }
.customer { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
.customer-suffix { font-size: 11px; font-weight: normal; margin-left: 20px; }

.subject { font-size: 12px; font-weight: bold; margin: 20px 0 10px; display: flex; align-items: baseline; min-width: 60%; border-bottom: 1px solid #333; padding-bottom: 3px; }
.subject-label { white-space: nowrap; }
.subject-value { font-weight: normal; flex: 1; text-align: center; }

.mid-section { display: flex; justify-content: space-between; margin: 20px 0 15px; gap: 40px; }
.mid-left { flex: 1; padding-top: 25px; }
.mid-right { width: 48%; }

.due-row { font-size: 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; }
.due-label { margin-right: 8px; }
.due-value { border-bottom: 1px solid #333; flex: 1; padding: 2px 8px; font-size: 11px; text-align: center; }

.bank-title { text-align: center; font-size: 9px; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #999; padding-bottom: 3px; }
.bank-table { width: 100%; font-size: 9px; border-collapse: collapse; }
.bank-table td { padding: 3px 5px; }
.bank-table .label { width: 40%; color: #444; }
.bank-table .value { text-align: right; }

.total-header { display: flex; align-items: baseline; margin: 15px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #333; }
.total-header .label { font-size: 13px; font-weight: bold; margin-right: 20px; }
.total-header .amount { font-size: 16px; font-weight: bold; margin-right: 10px; }
.total-header .tax-note { font-size: 10px; }

.detail-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
.detail-table th { background: #d6eaf8; color: #333; font-size: 9px; font-weight: bold; padding: 6px 8px; border: 1px solid #bbb; text-align: center; }
.detail-table th.no-col { width: 35px; }
.detail-table th.amt-col { width: 100px; text-align: center; }
.detail-table td { padding: 5px 8px; border: 1px solid #ccc; font-size: 9px; height: 18px; text-align: center; }
.detail-table td.no { text-align: center; width: 35px; }
.detail-table td.amt { text-align: center; width: 100px; }

.summary-table { width: 220px; margin-left: auto; border-collapse: collapse; margin-bottom: 15px; }
.summary-table td { padding: 5px 8px; font-size: 10px; border: 1px solid #bbb; }
.summary-table .label { font-weight: bold; text-align: center; background: #d6eaf8; color: #333; width: 80px; }
.summary-table .value { text-align: right; width: 140px; }

.notes { margin-top: 10px; }
.notes-title { font-size: 10px; font-weight: bold; margin-bottom: 5px; }
.notes-body { font-size: 9px; color: #444; }

.company-footer { position: absolute; bottom: 25mm; left: 20mm; right: 20mm; text-align: center; }
.company-footer .name { font-size: 10px; margin-bottom: 5px; padding-bottom: 4px; border-bottom: 1px solid #ccc; display: inline-block; }
.company-footer .address { font-size: 9px; color: #444; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #ccc; display: inline-block; }
.company-footer .rep { font-size: 9px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #ccc; display: inline-block; }
.company-footer .reg { font-size: 9px; color: #444; }
</style></head><body><div class="page">

<div class="title">${esc(L.title || '御請求書')}</div>
<div class="date">${invoiceDate ? formatDate(invoiceDate) : ''}</div>
<div class="customer">${esc(data.customerName || '')}<span class="customer-suffix">御中</span></div>

<div class="subject"><span class="subject-label">件名：</span><span class="subject-value">${esc(data.subject || '')}</span></div>

<div class="mid-section">
  <div class="mid-left">
    <div class="due-row">
      <span class="due-label">有効期限：</span>
      <span class="due-value">${dueDate ? formatDate(dueDate) : ''}</span>
    </div>
  </div>
  <div class="mid-right">
    <div class="bank-title">お振込み先情報</div>
    <table class="bank-table">
      <tr><td class="label">金融機関名</td><td class="value">${esc(bank['金融機関名'] || bank['⾦融機関名'] || '')}</td></tr>
      <tr><td class="label">支店名</td><td class="value">${esc(bank['支店名'] || bank['⽀店名'] || '')}</td></tr>
      <tr><td class="label">預金種類</td><td class="value">${esc(bank['預金種類'] || bank['預⾦種類'] || '')}</td></tr>
      <tr><td class="label">口座番号</td><td class="value">${esc(bank['口座番号'] || bank['⼝座番号'] || '')}</td></tr>
      <tr><td class="label">口座名義</td><td class="value">${esc(bank['口座名義'] || bank['⼝座名義'] || '')}</td></tr>
    </table>
  </div>
</div>

<div class="total-header">
  <span class="label">合計金額</span>
  <span class="amount">${data.total !== undefined ? fmt(data.total) : ''}</span>
  <span class="tax-note">（税込）</span>
</div>

<table class="detail-table">
  <thead><tr><th class="no-col">No.</th><th>摘要</th><th class="amt-col">金額</th></tr></thead>
  <tbody>${linesHTML}</tbody>
</table>

<table class="summary-table">
  <tr><td class="label">消費税</td><td class="value">${data.tax !== undefined ? fmt(data.tax) : ''}</td></tr>
  <tr><td class="label">合計</td><td class="value">${data.total !== undefined ? fmt(data.total) : ''}</td></tr>
</table>

<div class="notes">
  <div class="notes-title">備考</div>
  <div class="notes-body">${esc(L.notesText || '・振込み手数料はお客様負担でお願い致します。')}</div>
</div>

<div class="company-footer">
  <div class="name">${esc(cs?.companyName || 'Flourish Japan株式会社')}</div><br>
  <div class="address">${esc(cs ? `〒${cs.postalCode} ${cs.address}` : '〒810-0001 福岡県福岡市中央区天神2丁目2番12号　T＆Jビルディング７F')}</div><br>
  <div class="rep">${esc(cs?.representative || '代表取締役　川口　直人')}</div><br>
  <div class="reg">${esc(cs ? `登録番号　${cs.registrationNumber}` : '登録番号　T1290001106865')}</div>
</div>

</div></body></html>`;

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  }

  /** converted.pdf + pdf-lib でデータを直接書き込み（フォント崩れなし） */
  private async generateFromPdfLib(
    templateDir: string,
    template: DocumentTemplate,
    data: Record<string, any>,
    pdfPath: string,
  ): Promise<void> {
    const { PDFDocument, rgb } = await import('pdf-lib');
    const fontkit = await import('@pdf-lib/fontkit');

    // テンプレートPDFを読み込み
    const convertedPdf = path.join(templateDir, 'converted.pdf');
    const pdfBytes = fs.readFileSync(convertedPdf);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit.default);

    // 日本語フォントを埋め込み
    let font: any;
    const fontPaths = [
      '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
      '/Library/Fonts/NotoSansJP-Regular.otf',
      '/Library/Fonts/NotoSansCJKjp-Regular.otf',
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    ];
    for (const fp of fontPaths) {
      if (fs.existsSync(fp)) {
        try {
          font = await pdfDoc.embedFont(fs.readFileSync(fp), { subset: true });
          break;
        } catch { continue; }
      }
    }
    if (!font) {
      const { StandardFonts } = await import('pdf-lib');
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    let fontBold = font;
    const boldPaths = [
      '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
      '/Library/Fonts/NotoSansJP-Bold.otf',
    ];
    for (const fp of boldPaths) {
      if (fs.existsSync(fp)) {
        try {
          fontBold = await pdfDoc.embedFont(fs.readFileSync(fp), { subset: true });
          break;
        } catch { continue; }
      }
    }

    const page = pdfDoc.getPage(0);
    const { height: pageH } = page.getSize();
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const fmt = (n: number) => '¥' + n.toLocaleString('ja-JP');

    // テンプレート上の可変データを白で消す（日付、No.1、合計¥0など）
    const { execSync: exec } = require('child_process');
    try {
      const bboxXml = exec(`pdftotext -bbox "${convertedPdf}" -`, { timeout: 10000, encoding: 'utf-8' });
      const wordRegex = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g;
      let wm;
      while ((wm = wordRegex.exec(bboxXml)) !== null) {
        const text = wm[5];
        const xMin = parseFloat(wm[1]);
        const yMin = parseFloat(wm[2]);
        const xMax = parseFloat(wm[3]);
        const yMax = parseFloat(wm[4]);
        // 日付（yyyy年）、No.行のデフォルト「1」、合計の「¥0」「\0」を白で消す
        if (/^\d{4}年/.test(text) || (text === '1' && yMin > 285 && yMin < 300) || /^[¥\\]0$/.test(text)) {
          page.drawRectangle({
            x: xMin - 1, y: pageH - yMax - 1,
            width: xMax - xMin + 2, height: yMax - yMin + 2,
            color: white,
          });
        }
      }
    } catch (e) {
      logger.warn(`テンプレート消去処理スキップ: ${e instanceof Error ? e.message : e}`);
    }

    // layout.json から座標を読み込み（なければ再検出）
    const layoutPath = path.join(templateDir, 'layout.json');
    let L: Record<string, any>;
    if (fs.existsSync(layoutPath)) {
      L = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
    } else {
      L = this.detectPdfLayout(convertedPdf);
      fs.writeFileSync(layoutPath, JSON.stringify(L, null, 2));
    }

    // 宛名
    if (data.customerName && L.customerName) {
      page.drawText(data.customerName, {
        x: L.customerName.x, y: L.customerName.y, size: 14, font, color: black,
      });
    }

    // 請求日
    const invoiceDate = data.invoiceDate || data.estimateDate || '';
    if (invoiceDate && L.invoiceDate) {
      const d = new Date(invoiceDate);
      const dateStr = `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`;
      page.drawText(dateStr, {
        x: L.invoiceDate.x, y: L.invoiceDate.y, size: 10, font, color: black,
      });
    }

    // 件名
    if (data.subject && L.subject) {
      page.drawText(data.subject, {
        x: L.subject.x, y: L.subject.y, size: 12, font: fontBold, color: black,
      });
    }

    // 支払期限/有効期限
    const dueDate = data.dueDate || data.validUntil || '';
    if (dueDate && L.dueDate) {
      const d = new Date(dueDate);
      const dateStr = `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`;
      page.drawText(dateStr, {
        x: L.dueDate.x, y: L.dueDate.y, size: 10, font, color: black,
      });
    }

    // 合計金額（ヘッダー部分）
    if (data.total !== undefined && L.totalAmount) {
      page.drawText(fmt(data.total), {
        x: L.totalAmount.x, y: L.totalAmount.y, size: 14, font: fontBold, color: black,
      });
    }

    // 明細行
    if (data.lines && Array.isArray(data.lines) && L.detailStartY) {
      const rowH = L.detailRowH || 13;
      const noX = L.detailNoX || 28;
      const itemX = L.detailItemX || 55;
      const amtRight = L.detailAmountRight || 550;

      data.lines.forEach((line: any, i: number) => {
        const y = L.detailStartY - i * rowH;
        page.drawText(String(i + 1), {
          x: noX, y, size: 9, font, color: black,
        });
        page.drawText(line.item || '', {
          x: itemX, y, size: 9, font, color: black,
        });
        const amount = line.amount || (line.unitPrice || 0) * (line.quantity || 1);
        const amtStr = fmt(amount);
        const amtWidth = font.widthOfTextAtSize(amtStr, 9);
        page.drawText(amtStr, {
          x: amtRight - amtWidth, y, size: 9, font, color: black,
        });
      });
    }

    // 消費税
    if (data.tax !== undefined && L.taxY) {
      const taxStr = fmt(data.tax);
      const taxWidth = font.widthOfTextAtSize(taxStr, 10);
      page.drawText(taxStr, {
        x: (L.taxAmountRight || 550) - taxWidth, y: L.taxY, size: 10, font, color: black,
      });
    }

    // 合計（下段）
    if (data.total !== undefined && L.grandTotalY) {
      const totalStr = fmt(data.total);
      const totalWidth = fontBold.widthOfTextAtSize(totalStr, 10);
      page.drawText(totalStr, {
        x: (L.grandTotalRight || 550) - totalWidth, y: L.grandTotalY, size: 10, font: fontBold, color: black,
      });
    }

    // 請求書番号（備考欄下に記載）
    if (data.invoiceNo && L.notesX !== undefined && L.notesY !== undefined) {
      page.drawText(`請求書番号: ${data.invoiceNo}`, {
        x: L.notesX, y: L.notesY - 15, size: 9, font, color: black,
      });
    }

    const outputBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, Buffer.from(outputBytes));
  }

  /** Excel テンプレートにデータを書き込んでPDF変換（フォールバック） */
  private async generateFromExcel(
    templateDir: string,
    template: DocumentTemplate,
    data: Record<string, any>,
    pdfPath: string,
  ): Promise<void> {
    const ExcelJS = await import('exceljs');
    const { execSync } = await import('child_process');
    const wb = new ExcelJS.default.Workbook();
    const srcPath = path.join(templateDir, template.templateFile);
    await wb.xlsx.readFile(srcPath);
    const ws = wb.worksheets[0];

    // --- 値のみ書き込み（セルの既存フォント・書式を保持） ---

    // --- セルマッピング（テンプレートの構造を自動検出） ---
    // 宛名: Row4 A列
    if (data.customerName) {
      ws.getCell('A4').value = data.customerName;
    }

    // 請求日/見積日
    const invoiceDate = data.invoiceDate || data.estimateDate || '';
    if (invoiceDate) {
      const dateCell = ws.getCell('K3');
      dateCell.value = new Date(invoiceDate);
      dateCell.numFmt = 'yyyy"年"mm"月"dd"日"';
    }

    // 件名（事業内容）
    if (data.subject) {
      ws.getCell('B7').value = data.subject;
    }

    // 請求書番号は備考欄に記載
    if (data.invoiceNo) {
      const notesRow = 33;
      ws.getCell(notesRow, 1).value = `請求書番号: ${data.invoiceNo}`;
    }

    // 支払期限/有効期限
    const dueDate = data.dueDate || data.validUntil || '';
    if (dueDate) {
      ws.eachRow((row, num) => {
        row.eachCell((cell) => {
          const v = String(cell.value || '');
          if (v.includes('有効期限') || v.includes('支払期限')) {
            const dueDateCell = ws.getCell(num, 3);
            dueDateCell.value = new Date(dueDate);
            dueDateCell.numFmt = 'yyyy"年"mm"月"dd"日"';
          }
        });
      });
    }

    // 明細行の書き込み
    if (data.lines && Array.isArray(data.lines)) {
      // 明細の開始行を検出（「No.」ヘッダーの次の行）
      let headerRow = 17; // デフォルト
      ws.eachRow((row, num) => {
        row.eachCell((cell) => {
          if (cell.value === 'No.' || cell.value === 'NO.' || cell.value === 'no.') {
            headerRow = num;
          }
        });
      });
      const startRow = headerRow + 1;

      // 既存の明細を消去（最大12行分）
      for (let r = startRow; r < startRow + 12; r++) {
        ws.getCell(r, 1).value = null;
        ws.getCell(r, 2).value = null;
        ws.getCell(r, 14).value = null;
      }

      // 新しい明細を書き込み（セルの既存フォントを維持）
      data.lines.forEach((line: any, i: number) => {
        const row = startRow + i;
        ws.getCell(row, 1).value = i + 1;
        ws.getCell(row, 2).value = line.item || '';
        const amount = line.amount || (line.unitPrice || 0) * (line.quantity || 1);
        ws.getCell(row, 14).value = amount;
        ws.getCell(row, 14).numFmt = '¥#,##0';
      });

      // 合計金額を更新
      if (data.subtotal !== undefined) {
        ws.eachRow((row, num) => {
          row.eachCell((cell) => {
            const v = String(cell.value || '');
            if (v === '合計金額') {
              const totalCell = ws.getCell(num, 4);
              totalCell.value = data.total || data.subtotal;
              totalCell.numFmt = '¥#,##0';
            }
          });
        });
      }

      // 消費税・合計
      ws.eachRow((row, num) => {
        row.eachCell((cell) => {
          const v = String(cell.value || '');
          if (v === '消費税') {
            const taxCell = ws.getCell(num, 14);
            taxCell.value = data.tax || 0;
            taxCell.numFmt = '¥#,##0';
          }
          if (v === '合計' && num > startRow) {
            const gtCell = ws.getCell(num, 14);
            gtCell.value = data.total || 0;
            gtCell.numFmt = '¥#,##0';
          }
        });
      });
    }

    // 一時ファイルに保存
    const tmpXlsx = path.join(DOCUMENTS_DIR, `tmp-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(tmpXlsx);

    // LibreOfficeでPDF変換
    try {
      execSync(`soffice --headless --convert-to pdf --outdir "${DOCUMENTS_DIR}" "${tmpXlsx}"`, {
        timeout: 30000,
        stdio: 'pipe',
      });
      const baseName = path.basename(tmpXlsx, '.xlsx');
      const generatedPdf = path.join(DOCUMENTS_DIR, `${baseName}.pdf`);
      if (fs.existsSync(generatedPdf)) {
        fs.renameSync(generatedPdf, pdfPath);
      }
    } finally {
      if (fs.existsSync(tmpXlsx)) fs.unlinkSync(tmpXlsx);
    }

    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF変換に失敗しました');
    }
  }

  /** HTML overlay 方式でPDF生成（画像/PDFテンプレート用） */
  private async generateFromHTML(template: DocumentTemplate, data: Record<string, any>, pdfPath: string): Promise<void> {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const html = this.generateDocumentHTML(template, data);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  }

  /** 生成済みドキュメント取得 */
  getDocument(docId: string): GeneratedDocument | null {
    const metaPath = path.join(DOCUMENTS_DIR, `${docId}.json`);
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  /** 生成済みドキュメント一覧 */
  deleteDocument(id: string): void {
    const jsonPath = path.join(DOCUMENTS_DIR, `${id}.json`);
    if (fs.existsSync(jsonPath)) {
      const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      // PDFも削除
      if (doc.pdfPath && fs.existsSync(doc.pdfPath)) {
        fs.unlinkSync(doc.pdfPath);
      }
      fs.unlinkSync(jsonPath);
    }
  }

  deleteAllDocuments(): number {
    if (!fs.existsSync(DOCUMENTS_DIR)) return 0;
    const files = fs.readdirSync(DOCUMENTS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const doc = JSON.parse(fs.readFileSync(path.join(DOCUMENTS_DIR, f), 'utf-8'));
      if (doc.pdfPath && fs.existsSync(doc.pdfPath)) {
        fs.unlinkSync(doc.pdfPath);
      }
      fs.unlinkSync(path.join(DOCUMENTS_DIR, f));
    }
    return files.length;
  }

  listDocuments(): GeneratedDocument[] {
    if (!fs.existsSync(DOCUMENTS_DIR)) return [];
    return fs.readdirSync(DOCUMENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(DOCUMENTS_DIR, f), 'utf-8')))
      .sort((a: GeneratedDocument, b: GeneratedDocument) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const secretaryService = new SecretaryService();
