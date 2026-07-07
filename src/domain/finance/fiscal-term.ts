/**
 * 設立日と決算月から「何期目か」を算出する。
 *
 * - 1期目 = 設立日 〜 設立後（同月含む）最初に到来する決算月末。
 * - 以降は 12 か月ごとに 1 期。
 * - refDate 時点で進行中の期の番号を返す。
 *
 * 分析側で「何期目」が必要なときは、会社情報の establishedDate と 決算月
 * (fiscalYearEndMonth) を渡してこの関数から取得する。
 *
 * @param establishedDate 'YYYY-MM-DD'
 * @param fiscalYearEndMonth 決算月 (1-12)
 * @param refDate 基準日（省略時は呼び出し側で new Date() を渡す）
 * @returns 期番号(1以上)。算出できない場合は null。
 */
export function getFiscalTermNumber(
  establishedDate: string | null | undefined,
  fiscalYearEndMonth: number | null | undefined,
  refDate: Date,
): number | null {
  if (!establishedDate || !fiscalYearEndMonth || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
    return null;
  }
  const e = new Date(establishedDate);
  if (Number.isNaN(e.getTime())) return null;

  const m = fiscalYearEndMonth;
  const eOrd = e.getFullYear() * 12 + (e.getMonth() + 1); // 設立の年月序数
  // 設立後（同月含む）最初の決算期末の年
  const firstFyeYear = m >= e.getMonth() + 1 ? e.getFullYear() : e.getFullYear() + 1;

  const rOrd = refDate.getFullYear() * 12 + (refDate.getMonth() + 1);
  if (rOrd < eOrd) return null; // 設立前の日付

  // 基準日以降で最初に到来する決算期末の年を探す
  let fyeYear = firstFyeYear;
  // 上限ガード（1000期 = 極端値の暴走防止）
  for (let i = 0; i < 1000 && fyeYear * 12 + m < rOrd; i++) fyeYear++;

  return fyeYear - firstFyeYear + 1;
}

/** 「現在N期目（対象期の期末: YYYY年M月期）」のような表示用文字列を返す。 */
export function describeFiscalTerm(
  establishedDate: string | null | undefined,
  fiscalYearEndMonth: number | null | undefined,
  refDate: Date,
): { term: number; fyeYear: number; fyeMonth: number } | null {
  const term = getFiscalTermNumber(establishedDate, fiscalYearEndMonth, refDate);
  if (term === null || !fiscalYearEndMonth) return null;
  const e = new Date(establishedDate as string);
  const m = fiscalYearEndMonth;
  const firstFyeYear = m >= e.getMonth() + 1 ? e.getFullYear() : e.getFullYear() + 1;
  const fyeYear = firstFyeYear + term - 1;
  return { term, fyeYear, fyeMonth: m };
}
