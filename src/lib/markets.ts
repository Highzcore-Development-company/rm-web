/**
 * The 30 markets, from the brief's appendix.
 *
 * FX carries the `+` suffix because those are Vantage's Raw ECN symbols. The
 * plain names are Standard-account symbols at roughly seven times the spread —
 * the brief puts the cost of getting this wrong at 3x per trade, so the suffix
 * is part of the identifier, not decoration.
 */

export type Market = {
  symbol: string;
  kind: "forex" | "crypto";
};

const FOREX = [
  "EURGBP+", "GBPCHF+", "USDCAD+", "USDJPY+", "EURJPY+",
  "NZDJPY+", "EURUSD+", "NZDUSD+", "EURAUD+", "USDCHF+",
  "CADJPY+", "AUDNZD+", "AUDUSD+", "GBPJPY+", "GBPUSD+",
];

const CRYPTO = [
  "BTCUSD", "ZECUSD", "ETHUSD", "TRXUSD", "BNBUSD",
  "SOLUSD", "HBARUSD", "XRPUSD", "LNKUSD", "UNIUSD",
  "BCHUSD", "XLMUSD", "LTCUSD", "DOGUSD", "ADAUSD",
];

export const MARKETS: Market[] = [
  ...FOREX.map((symbol) => ({ symbol, kind: "forex" as const })),
  ...CRYPTO.map((symbol) => ({ symbol, kind: "crypto" as const })),
];
