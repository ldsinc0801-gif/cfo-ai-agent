-- migration-023: 営業運転資本の内訳（売上債権・棚卸資産・仕入債務）
-- 残高試算表には載っているが従来は合計しか保存していなかった。これらを保存し、
-- ロカベン6指標の「営業運転資本回転期間」を算出できるようにする。
--  売上債権 = 受取手形＋売掛金＋電子記録債権
--  棚卸資産 = 商品＋製品＋仕掛品＋原材料＋貯蔵品
--  仕入債務 = 支払手形＋買掛金＋電子記録債務
ALTER TABLE monthly_actuals
  ADD COLUMN IF NOT EXISTS accounts_receivable numeric,
  ADD COLUMN IF NOT EXISTS inventory numeric,
  ADD COLUMN IF NOT EXISTS accounts_payable numeric;
