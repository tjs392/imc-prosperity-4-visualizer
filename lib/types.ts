export type ActivityRow = {
  timestamp: number;
  product: string;
  day?: number;
  bidPrice1: number | null;
  bidVolume1: number | null;
  bidPrice2: number | null;
  bidVolume2: number | null;
  bidPrice3: number | null;
  bidVolume3: number | null;
  askPrice1: number | null;
  askVolume1: number | null;
  askPrice2: number | null;
  askVolume2: number | null;
  askPrice3: number | null;
  askVolume3: number | null;
  midPrice: number | null;
  pnl: number;
};

export type Trade = {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency: string;
  price: number;
  quantity: number;
};

export type Order = {
  symbol: string;
  price: number;
  quantity: number;
};

export type Listing = {
  symbol: string;
  product: string;
  denomination: string;
};

export type SandboxEntry = {
  timestamp: number;
  listings: Record<string, Listing>;
  orders: Record<string, Order[]>;
};

export type ProductSeriesRow = {
  timestamp: number;
  midPrice: number | null;
  pnl: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
};

export type ProductSeries = {
  product: string;
  rows: ProductSeriesRow[];
};

export type ParsedLog = {
  products: ProductSeries[];
  activities: ActivityRow[];
  trades: Trade[];
  sandbox: SandboxEntry[];
  listings: Record<string, Listing>;
};

export type HistoricalDay = {
  day: number;
  activities: ActivityRow[];
  trades: Trade[];
  products: string[];
};