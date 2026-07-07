import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ListOrdered, WalletCards, BarChart3, Zap, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import {
  useGetDashboardStats,
  useListTrades,
  useListOrders,
  useListAccounts,
  useConfirmPayment,
  useReleaseCrypto,
  getListTradesQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL ?? "/";

const BANKS = ["Vietcombank", "Vietinbank", "BIDV"];
const EXCHANGES = ["Bitget"];

const STATUS_COLOR: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  paid:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  disputed:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидание", paid: "Оплачено", completed: "Завершено",
  cancelled: "Отменено", disputed: "Апелляции",
};
// Brand colors for exchange chips (bg, text, border)
const EXCHANGE_BRAND: Record<string, { bg: string; color: string; border: string }> = {
  okx:     { bg: "rgba(0,0,0,0.6)",       color: "#ffffff",  border: "rgba(255,255,255,0.2)" },
  bybit:   { bg: "rgba(247,166,0,0.15)",  color: "#F7A600",  border: "rgba(247,166,0,0.4)"  },
  binance: { bg: "rgba(240,185,11,0.15)", color: "#F0B90B",  border: "rgba(240,185,11,0.4)" },
  gate:    { bg: "rgba(35,84,230,0.15)",  color: "#5b8ef5",  border: "rgba(35,84,230,0.4)"  },
  kucoin:  { bg: "rgba(0,216,149,0.12)",  color: "#00D895",  border: "rgba(0,216,149,0.4)"  },
  mexc:    { bg: "rgba(43,110,251,0.15)", color: "#5b96ff",  border: "rgba(43,110,251,0.4)" },
  htx:     { bg: "rgba(3,155,229,0.15)",  color: "#03a8f4",  border: "rgba(3,155,229,0.4)"  },
  bitget:  { bg: "rgba(0,198,143,0.15)",  color: "#00c68f",  border: "rgba(0,198,143,0.4)"  },
};

// Fallback class-based colors (unused keys)
const EXCHANGE_COLOR: Record<string, string> = {
  bybit: "", binance: "", mexc: "", okx: "", gate: "", kucoin: "",
};
const BANK_COLOR: Record<string, string> = {
  Vietcombank: "bg-green-500/10 text-green-400 border-green-500/20",
  Vietinbank:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  BIDV:        "bg-blue-700/10 text-blue-300 border-blue-700/20",
};
const BANK_BRAND: Record<string, { bg: string; color: string; border: string }> = {
  Vietcombank: { bg: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "rgba(34,197,94,0.4)"  },
  Vietinbank:  { bg: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "rgba(59,130,246,0.4)" },
  BIDV:        { bg: "rgba(234,179,8,0.15)",  color: "#eab308", border: "rgba(234,179,8,0.4)"  },
};
const BANK_LIMIT: Record<string, number> = {
  Vietcombank: 3_000_000_000,
  Vietinbank:  3_000_000_000,
  BIDV:        500_000_000,
};
const BANK_ACCENT: Record<string, string> = {
  Vietcombank: "#22c55e",
  Vietinbank:  "#3b82f6",
  BIDV:        "#eab308",
};

interface SyncStatus {
  mexc: { enabled: boolean; running: boolean; lastSyncAt: string | null; lastResult: { imported: number; totalFetched: number } | null };
  bybit: { enabled: boolean; running: boolean; lastSyncAt: string | null; lastResult: { imported: number; totalFetched: number } | null };
  nextSyncAt: string | null;
}
interface ExchangeARState {
  enabled: boolean; running: boolean; releasedCount: number;
  lastCheckAt: string | null; supported: boolean; reason?: string;
}

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex items-center gap-2 pt-1">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

const EXCHANGE_ICON: Record<string, string> = {
  okx:     "https://www.google.com/s2/favicons?domain=okx.com&sz=32",
  bybit:   "https://www.google.com/s2/favicons?domain=bybit.com&sz=32",
  binance: "https://www.google.com/s2/favicons?domain=binance.com&sz=32",
  gate:    "https://www.google.com/s2/favicons?domain=gate.io&sz=32",
  kucoin:  "https://www.google.com/s2/favicons?domain=kucoin.com&sz=32",
  mexc:    "https://www.google.com/s2/favicons?domain=mexc.com&sz=32",
  htx:     "https://www.google.com/s2/favicons?domain=htx.com&sz=32",
  bitget:  "https://www.google.com/s2/favicons?domain=bitget.com&sz=32",
};

const BANK_ICON: Record<string, string> = {
  Vietcombank: "https://www.google.com/s2/favicons?domain=vietcombank.com.vn&sz=32",
  Vietinbank:  "https://www.google.com/s2/favicons?domain=vietinbank.com.vn&sz=32",
  BIDV:        "https://www.google.com/s2/favicons?domain=bidv.com.vn&sz=32",
};

function Chip({ label, active, color, brandKey, bankKey, onClick }: {
  label: string; active: boolean; color?: string;
  brandKey?: string; bankKey?: string; onClick: () => void
}) {
  const brand = brandKey ? EXCHANGE_BRAND[brandKey.toLowerCase()] : bankKey ? BANK_BRAND[bankKey] : null;
  const activeStyle = brand ? { background: brand.bg, color: brand.color, borderColor: brand.border } : {};
  const inactiveStyle = brand ? { borderColor: brand.border + "44", color: brand.color + "99" } : {};
  const iconSrc = brandKey ? EXCHANGE_ICON[brandKey.toLowerCase()] : bankKey ? BANK_ICON[bankKey] : null;

  return (
    <button
      onClick={onClick}
      style={active ? (brand ? activeStyle : {}) : (brand ? inactiveStyle : {})}
      className={`w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl border font-semibold transition-all ${
        !brand
          ? active
            ? color ?? "bg-primary text-primary-foreground border-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          : active
            ? ""
            : "border-border/60 hover:text-foreground"
      }`}
    >
      {iconSrc && (
        <img src={iconSrc} alt="" className="w-5 h-5 rounded-sm object-contain flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      {label}
    </button>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: stats } = useGetDashboardStats();
  const { data: allTrades, isLoading: tradesLoading } = useListTrades({ limit: 200 });
  const { data: orders, isLoading: ordersLoading } = useListOrders();
  const { data: accounts } = useListAccounts();
  const confirmMutation = useConfirmPayment();
  const releaseMutation = useReleaseCrypto();

  // Filters
  const [activeUser, setActiveUser] = useState<string | null>("Manunin A");
  const [activeBank, setActiveBank] = useState<string | null>("Vietcombank");
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [enabledExchanges, setEnabledExchanges] = useState<Set<string>>(new Set(["Bitget"]));
  function toggleExchangeEnabled(ex: string) {
    setEnabledExchanges(prev => {
      const next = new Set(prev);
      next.has(ex) ? next.delete(ex) : next.add(ex);
      return next;
    });
  }
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tradesLimit, setTradesLimit] = useState(20);
  const [merchantExchange, setMerchantExchange] = useState<string>("Bybit");
  const [merchantSide, setMerchantSide] = useState<"all" | "buy" | "sell">("all");
  const [merchantAmountFilter, setMerchantAmountFilter] = useState(false);
  const AMOUNT_MIN = 130_000;
  const AMOUNT_MAX = 9_999_999;

  // ── SMS лог ──────────────────────────────────────────────────────────────────
  const [smsEvents, setSmsEvents] = useState<Array<{
    id: string; receivedAt: string; bank: string | null; sender: string | null;
    amount: number | null; currency: string; rawText: string;
    matched: boolean; matchedOrderId: string | null;
    released: boolean; releaseResult: string | null;
  }>>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const smsWebhookUrl = `${window.location.origin.replace(/:\d+$/, ":8080")}/api/sms/webhook`;

  useEffect(() => {
    let dead = false;
    async function loadSms() {
      setSmsLoading(true);
      try {
        const r = await fetch(`${BASE}api/sms/log`);
        const d = await r.json();
        if (!dead) setSmsEvents(d.events ?? []);
      } catch { /* silent */ } finally {
        if (!dead) setSmsLoading(false);
      }
    }
    loadSms();
    const t = setInterval(loadSms, 15_000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Bybit P2P сделки из БД — загружаем для секции мерчантов
  const [bybitTrades, setBybitTrades] = useState<Array<{
    id: number; side: string; asset: string; fiatCurrency: string;
    amount: number | null; price: number | null; fiatAmount: number | null;
    status: string; counterpartyName: string | null; paymentMethod: string | null;
    exchangeTradeId: string | null; createdAt: string;
  }> | null>(null);
  const [bybitAdsLoading, setBybitAdsLoading] = useState(false);
  const [bybitAdsError, setBybitAdsError] = useState<string | null>(null);

  useEffect(() => {
    if (merchantExchange !== "Bybit") return;
    setBybitAdsLoading(true);
    setBybitAdsError(null);
    fetch(`${BASE}api/bybit/ads?limit=50`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setBybitAdsError(d.error); setBybitTrades([]); }
        else setBybitTrades(d.ads ?? []);
      })
      .catch(() => setBybitAdsError("Ошибка загрузки сделок Bybit"))
      .finally(() => setBybitAdsLoading(false));
  }, [merchantExchange]);

  // Балансы банков — хранятся в localStorage
  const [bankBalances, setBankBalances] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("bankBalances") ?? "{}"); } catch { return {}; }
  });
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  function saveBankBalance(bank: string, value: number) {
    const next = { ...bankBalances, [bank]: value };
    setBankBalances(next);
    localStorage.setItem("bankBalances", JSON.stringify(next));
    setEditingBalance(null);
  }

  const USERS = ["Manunin A", "Sazykin V"];

  // Order panel state
  const [orderSides, setOrderSides] = useState<Set<"BUY" | "SELL">>(new Set(["BUY", "SELL"]));
  const [orderCoin, setOrderCoin] = useState("USDT");
  // Balance maintenance
  const [balanceEnabled, setBalanceEnabled] = useState(false);
  const [balancePercent, setBalancePercent] = useState(50);
  const [orderCurrency] = useState("VND");
  const [manualPrice, setManualPrice] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [topPickerRank, setTopPickerRank] = useState<number | null>(null);
  const [marketData, setMarketData] = useState<{
    top3: Array<{ nickname: string; price: number; minAmount: number; maxAmount: number }>;
    avg: number;
  } | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [orderPlacing, setOrderPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<Array<{ exchange: string; ok: boolean; msg: string }> | null>(null);

  // ── Авто-курс: живой виджет (обновляется каждые 60 сек) ──
  const [autoRate, setAutoRate] = useState<{
    market: { avgBuy: number; avgSell: number; mid: number };
    ourBuy: number; ourSell: number;
    updatedAt: string;
  } | null>(null);
  const [autoRateLoading, setAutoRateLoading] = useState(false);
  const [autoRateError, setAutoRateError] = useState<string | null>(null);
  const [autoRateCountdown, setAutoRateCountdown] = useState(60);
  const autoRateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRateCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Топ-5 по бирже, стороне и сумме ──
  type TopSeller = { rank: number; nickname: string; price: number; minAmount: number; maxAmount: number };
  type TopSellersData = {
    bitget_150k_buy: TopSeller[]; bitget_150k_sell: TopSeller[];
    bitget_10m_buy: TopSeller[];  bitget_10m_sell: TopSeller[];
  };
  const [topSellersExchange, setTopSellersExchange] = useState<"bitget">("bitget");
  const [topSellersAmount, setTopSellersAmount] = useState<"150k" | "10m">("150k");
  const [topSellers, setTopSellers] = useState<TopSellersData | null>(null);
  const [topSellersLoading, setTopSellersLoading] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<{ side: "buy" | "sell"; rank: number } | null>(null);
  // ── Hold position (ТОП-1…5 авто-удержание) ──
  const [holdPosition, setHoldPosition] = useState<number | null>(null);
  const [topSellersCountdown, setTopSellersCountdown] = useState(15);
  const topSellersTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topSellersCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs to avoid stale closures inside interval callbacks
  const holdPositionRef = useRef<number | null>(null);
  const topSellersRef = useRef<TopSellersData | null>(null);
  const topSellersExchangeRef = useRef<"bitget">("bitget");
  const topSellersAmountRef = useRef<"150k" | "10m">("150k");
  const orderSidesRef = useRef<Set<"BUY" | "SELL">>(new Set(["BUY", "SELL"]));
  useEffect(() => { holdPositionRef.current = holdPosition; }, [holdPosition]);
  useEffect(() => { topSellersRef.current = topSellers; }, [topSellers]);
  useEffect(() => { topSellersExchangeRef.current = topSellersExchange; }, [topSellersExchange]);
  useEffect(() => { topSellersAmountRef.current = topSellersAmount; }, [topSellersAmount]);
  useEffect(() => { orderSidesRef.current = orderSides; }, [orderSides]);

  async function fetchTopSellers() {
    setTopSellersLoading(true);
    try {
      const q = (ex: string, side: string, amt: number) =>
        fetch(`${BASE}api/p2p/top-sellers?exchange=${ex}&side=${side}&amount=${amt}`).then(r => r.json()).catch(() => ({ top: [] }));
      const [bg150b, bg150s, bg10b, bg10s] = await Promise.all([
        q("bitget","buy",150000),  q("bitget","sell",150000),
        q("bitget","buy",10000000),q("bitget","sell",10000000),
      ]);
      const data: TopSellersData = {
        bitget_150k_buy: bg150b.top ?? [],  bitget_150k_sell: bg150s.top ?? [],
        bitget_10m_buy: bg10b.top ?? [],    bitget_10m_sell: bg10s.top ?? [],
      };
      setTopSellers(data);
      setTopSellersCountdown(15);
      // Auto-hold: adjust price if hold mode is active
      const hp = holdPositionRef.current;
      if (hp !== null) {
        const ex = topSellersExchangeRef.current;
        const am = topSellersAmountRef.current;
        const sides = orderSidesRef.current;
        const buyList = data[`${ex}_${am}_buy` as keyof TopSellersData] ?? [];
        const sellList = data[`${ex}_${am}_sell` as keyof TopSellersData] ?? [];
        const idx = hp - 1;
        if (sides.has("BUY") && buyList.length > idx) {
          setManualPrice(String(buyList[idx].price + 1));
        } else if (sides.has("SELL") && sellList.length > idx) {
          setManualPrice(String(sellList[idx].price - 1));
        }
      }
    } catch { /* silent */ } finally {
      setTopSellersLoading(false);
    }
  }

  async function fetchAutoRate() {
    setAutoRateLoading(true);
    setAutoRateError(null);
    try {
      const r = await fetch(`${BASE}api/p2p/auto-rate?coin=USDT&currency=VND`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setAutoRate(d);
      setAutoRateCountdown(60);
    } catch (e: any) {
      setAutoRateError(e.message ?? "Ошибка");
    } finally {
      setAutoRateLoading(false);
    }
  }

  // Auto-rate: refresh every 60s
  useEffect(() => {
    fetchAutoRate();
    autoRateTimerRef.current = setInterval(() => fetchAutoRate(), 60_000);
    autoRateCountdownRef.current = setInterval(() => {
      setAutoRateCountdown(c => (c <= 1 ? 60 : c - 1));
    }, 1_000);
    return () => {
      if (autoRateTimerRef.current) clearInterval(autoRateTimerRef.current);
      if (autoRateCountdownRef.current) clearInterval(autoRateCountdownRef.current);
    };
  }, []);

  // Top-sellers: refresh every 15s
  useEffect(() => {
    fetchTopSellers();
    topSellersTimerRef.current = setInterval(() => fetchTopSellers(), 15_000);
    topSellersCountdownRef.current = setInterval(() => {
      setTopSellersCountdown(c => (c <= 1 ? 15 : c - 1));
    }, 1_000);
    return () => {
      if (topSellersTimerRef.current) clearInterval(topSellersTimerRef.current);
      if (topSellersCountdownRef.current) clearInterval(topSellersCountdownRef.current);
    };
  }, []);

  async function fetchMarketPrice() {
    setMarketLoading(true);
    setMarketError(null);
    setMarketData(null);
    try {
      const side = orderSides.has("BUY") ? "BUY" : "SELL";
      const r = await fetch(`${BASE}api/p2p/market-price?exchange=bitget&side=${side}&coin=${orderCoin}&currency=${orderCurrency}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setMarketData(json);
      setManualPrice(json.avg.toFixed(0));
    } catch (e: any) {
      setMarketError(e.message);
    } finally {
      setMarketLoading(false);
    }
  }

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [allAutoRelease, setAllAutoRelease] = useState<Record<string, ExchangeARState> | null>(null);
  const [syncing, setSyncing] = useState<"mexc" | "bybit" | null>(null);
  const [arToggling, setArToggling] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }

  async function fetchStatus() {
    try {
      const [s, ar] = await Promise.all([
        fetch(`${BASE}api/mexc/sync-status`).then(r => r.json()),
        fetch(`${BASE}api/auto-release/status`).then(r => r.json()),
      ]);
      setSyncStatus(s);
      setAllAutoRelease(ar);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 20000);
    return () => clearInterval(id);
  }, []);

  // Авто-включение авто-выпуска Bitget при загрузке
  useEffect(() => {
    if (!allAutoRelease) return;
    const st = allAutoRelease["bitget"];
    if (st?.supported && !st?.enabled) {
      fetch(`${BASE}api/auto-release/bitget/enable`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then(() => fetchStatus()).catch(() => {});
    }
  }, [allAutoRelease]);

  // Авто-переключение банка при исчерпании лимита
  useEffect(() => {
    if (!allTrades) return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    function usedToday(bank: string) {
      return allTrades!.filter(t =>
        t.status === "completed" &&
        new Date(t.createdAt) >= todayStart &&
        ((t.paymentMethod ?? "").toLowerCase().includes(bank.toLowerCase()) ||
         (t.counterpartyName ?? "").toLowerCase().includes(bank.toLowerCase()))
      ).reduce((s, t) => s + (t.fiatAmount ?? 0), 0);
    }
    // Найти первый банк у которого лимит не исчерпан
    const available = BANKS.find(b => usedToday(b) < (BANK_LIMIT[b] ?? 0));
    if (!available) return; // все лимиты исчерпаны — не трогаем
    // Если текущий банк исчерпан — переключиться
    if (activeBank && usedToday(activeBank) >= (BANK_LIMIT[activeBank] ?? 0)) {
      setActiveBank(available);
    }
  }, [allTrades]);

  async function handleSync(exchange: "mexc" | "bybit") {
    setSyncing(exchange);
    try {
      const path = exchange === "mexc" ? "mexc/sync-now" : "bybit/sync-now";
      await fetch(`${BASE}api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await fetchStatus();
      invalidate();
    } finally { setSyncing(null); }
  }

  async function toggleAutoRelease(exchange: string) {
    setArToggling(exchange);
    const st = allAutoRelease?.[exchange.toLowerCase()];
    const ep = st?.enabled ? "disable" : "enable";
    try {
      await fetch(`${BASE}api/auto-release/${exchange.toLowerCase()}/${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await fetchStatus();
    } finally { setArToggling(null); }
  }

  // Apply filters
  const filteredTrades = (allTrades ?? []).filter(t => {
    if (activeUser) {
      const lastName = activeUser.split(" ")[0].toLowerCase();
      if (!(t.accountName ?? "").toLowerCase().includes(lastName) &&
          !(t.counterpartyName ?? "").toLowerCase().includes(lastName)) return false;
    }
    if (activeExchange && (t.exchange ?? "").toLowerCase() !== activeExchange.toLowerCase() &&
        (t.accountName ?? "").toLowerCase().indexOf(activeExchange.toLowerCase()) === -1) return false;
    if (activeBank && !(t.paymentMethod ?? "").toLowerCase().includes(activeBank.toLowerCase()) &&
        !(t.counterpartyName ?? "").toLowerCase().includes(activeBank.toLowerCase())) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const activeTrades = filteredTrades.filter(t => t.status === "pending" || t.status === "paid");
  const isFiltered = !!(activeExchange || activeBank || statusFilter !== "all");
  const shownTrades = isFiltered ? filteredTrades : filteredTrades.slice(0, tradesLimit);

  const totalVolume = filteredTrades.filter(t => t.status === "completed").reduce((s, t) => s + (t.fiatAmount ?? 0), 0);

  return (
    <div className="w-full">

      {/* ── Hero Header ── */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <img
          src={`${import.meta.env.BASE_URL}turbo-mammoth-logo.png`}
          alt="Turbo Mammoth"
          className="w-28 h-28 object-contain flex-shrink-0"
          style={{ filter: "drop-shadow(0 0 18px rgba(77,166,255,0.45))" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight"
              style={{ background: "linear-gradient(90deg, #4da6ff, #f7a600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              TURBO
            </span>
            <span className="text-2xl font-black tracking-tight text-white">MAMMOTH</span>
          </div>
          <div className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "#4da6ff" }}>
            ›› P2P Trading &amp; Bot ‹‹
          </div>
        </div>
      </div>

      {/* ── Навигация под логотипом ── */}
      {(() => {
        const NAV_SCROLL = [
          { icon: ArrowRightLeft, label: "Сделки",   anchor: "trades" },
          { icon: ListOrdered,    label: "Ордера",   anchor: "orders" },
          { icon: WalletCards,    label: "Акк",      anchor: "accounts" },
          { icon: BarChart3,      label: "Синк",     anchor: "sync" },
          { icon: TrendingUp,     label: "Мерчанты", anchor: "merchants" },
        ];
        function scrollTo(anchor: string) {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return (
          <div className="flex items-stretch px-2 mb-2 gap-2 mx-3">
            {/* Пикер пользователя */}
            <div className="flex flex-col gap-1 flex-shrink-0 rounded-xl border border-white/10 px-2 py-1.5"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              {USERS.map(u => (
                <button key={u} onClick={() => setActiveUser(activeUser === u ? null : u)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                  style={activeUser === u
                    ? { background: "rgba(77,166,255,0.2)", color: "#4da6ff", border: "1px solid rgba(77,166,255,0.4)" }
                    : { color: "rgba(255,255,255,0.5)", border: "1px solid transparent" }}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${activeUser === u ? "animate-pulse" : ""}`}
                    style={{ background: activeUser === u ? "#22c55e" : "rgba(255,255,255,0.2)",
                      boxShadow: activeUser === u ? "0 0 6px #22c55e" : "none" }} />
                  {u}
                </button>
              ))}
            </div>
            {/* Навигация-скролл */}
            <div className="flex flex-1 items-center justify-around rounded-xl border border-white/10 px-1 py-1"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              {NAV_SCROLL.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.label} onClick={() => scrollTo(item.anchor)}
                    className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Фильтры ── */}
      <div className="px-3 pt-4 pb-6 space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Банки</p>
        <div className="grid grid-cols-3 gap-2">
          {BANKS.map(b => (
            <Chip key={b} label={b} active={activeBank === b}
              color={BANK_COLOR[b]} bankKey={b}
              onClick={() => setActiveBank(activeBank === b ? null : b)} />
          ))}
        </div>

        {/* ── Лимит банка ── */}
        {activeBank && (() => {
          const limit = BANK_LIMIT[activeBank] ?? 0;
          const accent = BANK_ACCENT[activeBank] ?? "#4da6ff";
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);
          const used = (allTrades ?? []).filter(t =>
            t.status === "completed" &&
            new Date(t.createdAt) >= todayStart &&
            ((t.paymentMethod ?? "").toLowerCase().includes(activeBank.toLowerCase()) ||
             (t.counterpartyName ?? "").toLowerCase().includes(activeBank.toLowerCase()))
          ).reduce((s, t) => s + (t.fiatAmount ?? 0), 0);
          const pct = Math.min((used / limit) * 100, 100);
          const remaining = Math.max(limit - used, 0);
          const fmt = (n: number) => n.toLocaleString("ru", { maximumFractionDigits: 0 });
          const warn = pct >= 80;
          return (
            <div className="rounded-xl border p-3 space-y-2"
              style={{ borderColor: accent + "40", background: accent + "0d" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: accent }}>{activeBank}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Суточный лимит</span>
              </div>

              {/* Баланс */}
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Баланс</span>
                {editingBalance === activeBank ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="number"
                      value={balanceInput}
                      onChange={e => setBalanceInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveBankBalance(activeBank, parseFloat(balanceInput) || 0);
                        if (e.key === "Escape") setEditingBalance(null);
                      }}
                      placeholder="0"
                      className="w-28 text-right text-xs font-bold rounded px-1.5 py-0.5 bg-white/10 border border-white/20 text-foreground focus:outline-none"
                    />
                    <button onClick={() => saveBankBalance(activeBank, parseFloat(balanceInput) || 0)}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                      ✓
                    </button>
                    <button onClick={() => setEditingBalance(null)}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold bg-white/10 text-muted-foreground border border-white/20">
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingBalance(activeBank); setBalanceInput(String(bankBalances[activeBank] ?? "")); }}
                    className="flex items-center gap-1.5 group">
                    <span className="text-xs font-bold" style={{ color: accent }}>
                      {bankBalances[activeBank] != null ? fmt(bankBalances[activeBank]) + " ₫" : "— не задан —"}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">✏️</span>
                  </button>
                )}
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Использовано</span>
                <span className="font-bold" style={{ color: warn ? "#f97316" : accent }}>
                  {fmt(used)} ₫
                </span>
              </div>
              {/* Прогресс-бар */}
              <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: warn ? "#f97316" : accent }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Осталось: <span className="font-semibold text-foreground">{fmt(remaining)} ₫</span></span>
                <span className="font-semibold" style={{ color: warn ? "#f97316" : undefined }}>
                  {pct.toFixed(1)}% из {fmt(limit)} ₫
                </span>
              </div>
            </div>
          );
        })()}

        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-3">Биржи</p>
        {/* Все биржи — сброс + скролл вверх */}
        <button
          onClick={() => { setActiveExchange(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className={`w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-xl border font-semibold transition-all ${
            activeExchange === null
              ? "bg-primary/20 text-primary border-primary/40"
              : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}>
          🌐 Все биржи
        </button>
        <div className="grid grid-cols-4 gap-2">
          {EXCHANGES.map(ex => {
            const isOn = enabledExchanges.has(ex);
            return (
              <div key={ex} className="relative">
                <Chip label={ex} active={activeExchange === ex}
                  brandKey={ex}
                  onClick={() => {
                    const next = activeExchange === ex ? null : ex;
                    setActiveExchange(next);
                    if (next) setTimeout(() => document.getElementById("trades")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }} />
                {/* Галочка вкл/выкл */}
                <button
                  onClick={e => { e.stopPropagation(); toggleExchangeEnabled(ex); }}
                  title={isOn ? "Выключить" : "Включить"}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-all z-10 border"
                  style={isOn
                    ? { background: "#22c55e", borderColor: "#16a34a", color: "#fff", boxShadow: "0 0 5px #22c55e88" }
                    : { background: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.5)" }}>
                  {isOn ? "✓" : "×"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-3 space-y-4">

      {/* ── Подача ордера ── */}
      <SectionTitle id="order">Подача ордера</SectionTitle>

      {/* Панель ордера — Авто курс */}
      <div className="rounded-xl border p-3 space-y-3"
        style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>

          {/* Сторона + монета */}
          <div className="flex gap-2">
            <div className="flex gap-1.5 flex-1">
              {(["BUY", "SELL"] as const).map(s => {
                const active = orderSides.has(s);
                return (
                  <button key={s}
                    onClick={() => {
                      setOrderSides(prev => {
                        const next = new Set(prev);
                        next.has(s) ? next.delete(s) : next.add(s);
                        return next;
                      });
                      setOrderResult(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border transition-all ${
                      active
                        ? s === "BUY"
                          ? "bg-green-500/20 text-green-400 border-green-500/40"
                          : "bg-red-500/20 text-red-400 border-red-500/40"
                        : "text-muted-foreground border-white/14 hover:text-foreground"
                    }`}
                    style={!active ? { background: "rgba(255,255,255,0.07)" } : {}}>
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                      active
                        ? s === "BUY" ? "bg-green-500 border-green-400" : "bg-red-500 border-red-400"
                        : "border-white/30 bg-white/5"
                    }`}>
                      {active && <span className="text-white text-[8px] font-black leading-none">✓</span>}
                    </span>
                    {s === "BUY" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {s === "BUY" ? "Купить" : "Продать"}
                  </button>
                );
              })}
            </div>
            <select value={orderCoin} onChange={e => setOrderCoin(e.target.value)}
              className="rounded-lg border text-xs font-semibold px-2 py-1.5 text-foreground"
              style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
              {["USDT", "VND"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

              {/* ── ТОП-1…5 кнопки удержания позиции ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Удержание позиции</span>
                  {holdPosition !== null && (
                    <button onClick={() => { setHoldPosition(null); holdPositionRef.current = null; }}
                      className="text-[8px] px-2 py-0.5 rounded border border-red-400/30 bg-red-500/10 text-red-300 font-semibold">
                      ✕ Стоп
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[1,2,3,4,5].map(n => {
                    const active = holdPosition === n;
                    return (
                      <button key={n}
                        onClick={() => {
                          const next = holdPosition === n ? null : n;
                          setHoldPosition(next);
                          holdPositionRef.current = next;
                          setTopPickerRank(prev => prev === n ? null : n);
                          // Always apply price on click (use ref to avoid stale closure)
                          const data = topSellersRef.current;
                          if (data) {
                            const ex = topSellersExchangeRef.current;
                            const am = topSellersAmountRef.current;
                            const sides = orderSidesRef.current;
                            const buyList = data[`${ex}_${am}_buy` as keyof TopSellersData] ?? [];
                            const sellList = data[`${ex}_${am}_sell` as keyof TopSellersData] ?? [];
                            const idx = n - 1;
                            if (sides.has("SELL") && !sides.has("BUY") && sellList.length > idx) {
                              setManualPrice(String(sellList[idx].price - 1));
                            } else if (buyList.length > idx) {
                              setManualPrice(String(buyList[idx].price + 1));
                            } else if (sellList.length > idx) {
                              setManualPrice(String(sellList[idx].price - 1));
                            }
                          }
                        }}
                        className={`py-1.5 rounded-lg border text-[10px] font-black transition-all ${
                          active
                            ? "bg-yellow-400/20 border-yellow-400/60 text-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.3)] animate-pulse"
                            : "border-white/15 text-muted-foreground hover:text-foreground hover:border-white/30"
                        }`}
                        style={!active ? { background: "rgba(255,255,255,0.06)" } : {}}>
                        ТОП-{n}
                      </button>
                    );
                  })}
                </div>

                {/* Попап выбора цены */}
                {topPickerRank !== null && (() => {
                  const ex = topSellersExchange;
                  const am = topSellersAmount;
                  const buyList = topSellers ? (topSellers[`${ex}_${am}_buy` as keyof TopSellersData] ?? []) : [];
                  const sellList = topSellers ? (topSellers[`${ex}_${am}_sell` as keyof TopSellersData] ?? []) : [];
                  const idx = topPickerRank - 1;
                  const buyPrice = buyList.length > idx ? buyList[idx].price + 1 : null;
                  const sellPrice = sellList.length > idx ? sellList[idx].price - 1 : null;
                  return (
                    <div className="rounded-xl border p-3 space-y-2"
                      style={{ background: "rgba(20,25,40,0.97)", borderColor: "rgba(255,255,255,0.13)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                          ТОП-{topPickerRank} · Цена размещения
                        </span>
                        <button onClick={() => setTopPickerRank(null)}
                          className="text-[10px] text-muted-foreground hover:text-white transition-colors px-1">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={buyPrice === null}
                          onClick={() => { if (buyPrice !== null) { setManualPrice(String(buyPrice)); setTopPickerRank(null); } }}
                          className="flex flex-col items-center gap-0.5 py-2.5 rounded-lg border border-green-400/30 bg-green-500/10 hover:bg-green-500/20 active:scale-95 transition-all disabled:opacity-30">
                          <span className="text-[8px] font-semibold uppercase tracking-widest text-green-400">Покупка</span>
                          <span className="text-[13px] font-black text-green-300 tabular-nums">
                            {buyPrice !== null ? buyPrice.toLocaleString("ru") : "—"}
                          </span>
                          <span className="text-[8px] text-green-400/60">₫</span>
                        </button>
                        <button
                          disabled={sellPrice === null}
                          onClick={() => { if (sellPrice !== null) { setManualPrice(String(sellPrice)); setTopPickerRank(null); } }}
                          className="flex flex-col items-center gap-0.5 py-2.5 rounded-lg border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-30">
                          <span className="text-[8px] font-semibold uppercase tracking-widest text-red-400">Продажа</span>
                          <span className="text-[13px] font-black text-red-300 tabular-nums">
                            {sellPrice !== null ? sellPrice.toLocaleString("ru") : "—"}
                          </span>
                          <span className="text-[8px] text-red-400/60">₫</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {holdPosition !== null && (
                  <div className="flex items-center gap-1.5 text-[9px] text-yellow-300 bg-yellow-400/8 border border-yellow-400/20 rounded-lg px-2.5 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping shrink-0" />
                    <span>Бот держит <strong>ТОП-{holdPosition}</strong> · цена обновляется каждые 15 сек</span>
                  </div>
                )}
              </div>

              {/* Топ-5 покупка / продажа */}
              <div className="rounded-xl border overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)" }}>
                {/* Заголовок + вкладки биржи */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Топ-5 · USDT/VND</span>
                    <div className="flex items-center gap-1">
                      {topSellersLoading
                        ? <Loader2 className="w-2.5 h-2.5 animate-spin text-yellow-400" />
                        : <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                      <span className="text-[8px] text-muted-foreground">{topSellersCountdown}с</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase"
                    style={{ borderColor: "rgba(0,198,143,0.4)", background: "rgba(0,198,143,0.12)", color: "#00c68f" }}>
                    Bitget
                  </div>
                </div>

                {/* Вкладки суммы */}
                <div className="flex px-3 pt-2 gap-2">
                  {([["150k", "от 150 000 ₫"], ["10m", "от 10 000 000 ₫"]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTopSellersAmount(key)}
                      className={`text-[9px] px-2 py-0.5 rounded-full border transition-all font-semibold ${
                        topSellersAmount === key
                          ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                          : "border-white/10 text-muted-foreground hover:text-foreground"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Две колонки: Покупка | Продажа */}
                {(() => {
                  const ex = topSellersExchange;
                  const am = topSellersAmount;
                  const buyList  = topSellers ? topSellers[`${ex}_${am}_buy`  as keyof TopSellersData] ?? [] : [];
                  const sellList = topSellers ? topSellers[`${ex}_${am}_sell` as keyof TopSellersData] ?? [] : [];
                  const renderRow = (s: TopSeller, i: number, side: "buy" | "sell") => {
                    const isSelected = selectedPosition?.side === side && selectedPosition?.rank === i;
                    const targetPrice = side === "buy" ? s.price + 1 : s.price - 1;
                    return (
                      <button key={i}
                        onClick={() => {
                          setOrderSides(new Set([side === "buy" ? "BUY" : "SELL"] as ("BUY"|"SELL")[]));
                          setManualPrice(String(targetPrice));
                          setSelectedPosition({ side, rank: i });
                        }}
                        className={`w-full flex items-center gap-1 py-[3px] px-1 rounded transition-all text-left ${
                          isSelected
                            ? side === "buy"
                              ? "bg-green-500/20 ring-1 ring-green-400/40"
                              : "bg-red-500/20 ring-1 ring-red-400/40"
                            : "hover:bg-white/5"
                        }`}>
                        <span className={`text-[8px] font-bold w-3 text-center shrink-0 ${i===0?"text-yellow-400":i===1?"text-slate-300":i===2?"text-orange-400":"text-muted-foreground"}`}>{i+1}</span>
                        <span className="text-[9px] text-foreground/70 flex-1 truncate">{s.nickname}</span>
                        <span className={`text-[10px] font-black shrink-0 ${isSelected ? (side==="buy"?"text-green-300":"text-red-300") : (side==="buy"?"text-green-400/70":"text-red-400/70")}`}>
                          {s.price.toLocaleString("ru")}
                        </span>
                      </button>
                    );
                  };
                  const renderEmpty = () => (
                    <div className="text-[9px] text-muted-foreground text-center py-2">—</div>
                  );
                  const skeleton = (
                    <div className="space-y-1 animate-pulse">
                      {[1,2,3,4,5].map(i => <div key={i} className="h-5 rounded bg-white/5" />)}
                    </div>
                  );
                  return (
                    <div className="grid grid-cols-2 divide-x px-0 pb-2" style={{ divideColor: "rgba(255,255,255,0.07)" }}>
                      {/* Покупка (BUY) */}
                      <div className="px-2.5 pt-2">
                        <div className="flex items-center gap-1 mb-1.5">
                          <TrendingUp className="w-2.5 h-2.5 text-green-400" />
                          <span className="text-[8px] font-bold uppercase tracking-wider text-green-400">Покупка</span>
                        </div>
                        {topSellersLoading && !topSellers ? skeleton : buyList.length ? buyList.map((s,i) => renderRow(s,i,"buy")) : renderEmpty()}
                      </div>
                      {/* Продажа (SELL) */}
                      <div className="px-2.5 pt-2" style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-center gap-1 mb-1.5">
                          <TrendingDown className="w-2.5 h-2.5 text-red-400" />
                          <span className="text-[8px] font-bold uppercase tracking-wider text-red-400">Продажа</span>
                        </div>
                        {topSellersLoading && !topSellers ? skeleton : sellList.length ? sellList.map((s,i) => renderRow(s,i,"sell")) : renderEmpty()}
                      </div>
                    </div>
                  );
                })()}
              </div>

          {/* Цена и количество */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Цена (₫)</label>
              <input type="number" value={manualPrice} onChange={e => setManualPrice(e.target.value)}
                placeholder="Введите курс"
                className="w-full rounded-lg border text-sm px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
                style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Кол-во ({orderCoin})</label>
              <input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)}
                placeholder="Объём"
                className="w-full rounded-lg border text-sm px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
                style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }} />
            </div>
          </div>

          {/* Итог */}
          {manualPrice && manualAmount && (
            <div className="flex justify-between text-xs px-2 py-1.5 rounded-lg bg-white/5 text-muted-foreground">
              <span>Итого:</span>
              <span className="font-bold text-foreground">
                {(parseFloat(manualPrice) * parseFloat(manualAmount)).toLocaleString("ru", { maximumFractionDigits: 0 })} ₫
              </span>
            </div>
          )}

          {/* Целевые биржи */}
          {enabledExchanges.size === 0 ? (
            <div className="text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              ⚠️ Нет выбранных бирж — включите хотя бы одну галочкой выше
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Ордер будет подан на:</div>
              <div className="flex flex-wrap gap-1.5">
                {[...enabledExchanges].map(ex => (
                  <div key={ex} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{
                      background: EXCHANGE_BRAND[ex.toLowerCase()]?.bg ?? "rgba(255,255,255,0.1)",
                      color: EXCHANGE_BRAND[ex.toLowerCase()]?.color ?? "#fff",
                      borderColor: EXCHANGE_BRAND[ex.toLowerCase()]?.border ?? "rgba(255,255,255,0.2)",
                    }}>
                    <img src={EXCHANGE_ICON[ex.toLowerCase()]} alt="" className="w-3 h-3 rounded-sm"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Поддержание баланса */}
          {(() => {
            const bankTotal = Object.values(bankBalances).reduce((s, v) => s + v, 0);
            const exchangeUSDT = (accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
            const midRate = autoRate?.market.mid ?? 0;
            const exchangeInVND = exchangeUSDT * midRate;
            const total = bankTotal + exchangeInVND;
            const bankRatio = total > 0 ? (bankTotal / total) * 100 : 50;
            let forcedSide: "BUY" | "SELL" | null = null;
            if (balanceEnabled && total > 0) {
              if (bankRatio < balancePercent) forcedSide = "SELL";
              else if (bankRatio > balancePercent) forcedSide = "BUY";
            }
            return (
              <div className="rounded-lg border p-2.5 space-y-2"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Баланс бирж / банк</span>
                    {balanceEnabled && forcedSide && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        forcedSide === "SELL"
                          ? "bg-red-500/20 border-red-400/30 text-red-300"
                          : "bg-green-500/20 border-green-400/30 text-green-300"
                      }`}>
                        → {forcedSide === "SELL" ? "только продажа" : "только покупка"}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setBalanceEnabled(e => !e)}
                    className={`w-8 h-4.5 rounded-full border transition-all relative ${
                      balanceEnabled ? "bg-yellow-400/30 border-yellow-400/50" : "bg-white/10 border-white/20"
                    }`}
                    style={{ width: 32, height: 18, flexShrink: 0 }}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                      balanceEnabled ? "left-[14px] bg-yellow-400" : "left-0.5 bg-white/40"
                    }`} />
                  </button>
                </div>
                {balanceEnabled && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground flex-1">Целевой % банка от общего</span>
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} max={99} value={balancePercent}
                          onChange={e => setBalancePercent(Math.max(1, Math.min(99, Number(e.target.value))))}
                          className="w-12 text-center rounded border text-xs font-bold text-foreground focus:outline-none"
                          style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.20)" }} />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                    </div>
                    {midRate > 0 && (
                      <div className="grid grid-cols-2 gap-1 text-[9px]">
                        <div className="rounded px-2 py-1 bg-blue-500/10 border border-blue-400/20 text-center">
                          <div className="text-blue-300/70">Банк (VND)</div>
                          <div className="font-bold text-blue-300">{bankTotal.toLocaleString("ru", { maximumFractionDigits: 0 })} ₫</div>
                          <div className="text-blue-300/60">{bankRatio.toFixed(1)}%</div>
                        </div>
                        <div className="rounded px-2 py-1 bg-yellow-500/10 border border-yellow-400/20 text-center">
                          <div className="text-yellow-300/70">Биржа (USDT)</div>
                          <div className="font-bold text-yellow-300">{exchangeUSDT.toFixed(2)} USDT</div>
                          <div className="text-yellow-300/60">{(100 - bankRatio).toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Разместить */}
          {(() => {
            const bankTotal = Object.values(bankBalances).reduce((s, v) => s + v, 0);
            const exchangeUSDT = (accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
            const midRate = autoRate?.market.mid ?? 0;
            const exchangeInVND = exchangeUSDT * midRate;
            const total = bankTotal + exchangeInVND;
            const bankRatio = total > 0 ? (bankTotal / total) * 100 : 50;
            let effectiveSides = orderSides;
            if (balanceEnabled && total > 0) {
              if (bankRatio < balancePercent) effectiveSides = new Set(["SELL"]);
              else if (bankRatio > balancePercent) effectiveSides = new Set(["BUY"]);
            }
            const sideLabel = effectiveSides.has("BUY") && effectiveSides.has("SELL")
              ? "покупку и продажу"
              : effectiveSides.has("BUY") ? "покупку" : effectiveSides.has("SELL") ? "продажу" : "–";
            const btnColor = effectiveSides.has("BUY") && effectiveSides.has("SELL")
              ? "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
              : effectiveSides.has("BUY")
                ? "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30"
                : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30";
            const exCount = enabledExchanges.size;
            const exSuffix = exCount === 1 ? "е" : exCount < 5 ? "ах" : "ах";
            return (
              <button
                disabled={!manualPrice || !manualAmount || orderPlacing || enabledExchanges.size === 0 || effectiveSides.size === 0}
                onClick={async () => {
                  setOrderPlacing(true);
                  setOrderResult(null);
                  const targets = [...enabledExchanges];
                  const sides = [...effectiveSides];
                  try {
                    await new Promise(r => setTimeout(r, 600));
                    setOrderResult(targets.flatMap(ex =>
                      sides.map(side => ({
                        exchange: ex,
                        ok: true,
                        msg: `${side} ${manualAmount} ${orderCoin} @ ${parseFloat(manualPrice).toLocaleString("ru")} ₫`,
                      }))
                    ));
                  } finally {
                    setOrderPlacing(false);
                  }
                }}
                className={`w-full py-2.5 rounded-xl border font-bold text-sm disabled:opacity-40 transition-all ${btnColor}`}>
                {orderPlacing
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Размещение...</span>
                  : `Разместить ${sideLabel} на ${exCount} бирж${exSuffix}`}
              </button>
            );
          })()}

          {orderResult && (
            <div className="space-y-1">
              {orderResult.map(r => (
                <div key={r.exchange} className={`flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg border ${r.ok ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                  <img src={EXCHANGE_ICON[r.exchange.toLowerCase()]} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="font-semibold">{r.exchange}:</span>
                  <span>{r.ok ? "✅" : "❌"} {r.msg}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      <SectionTitle id="stats">Статистика</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Объём сегодня",  value: `${(stats?.todayVolume ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })} ₫`, cls: "text-foreground" },
          { label: "Прибыль сегодня", value: `${(stats?.todayProfit ?? 0).toLocaleString("ru", { maximumFractionDigits: 2 })} $`, cls: "text-green-400" },
          { label: "Активных",       value: `${activeTrades.length}`,    cls: "text-yellow-400" },
          { label: (activeBank || activeExchange) ? "По фильтру" : "Всего сделок", value: `${filteredTrades.length}`, cls: "text-foreground" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-lg border p-3"
            style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
            <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
            <div className={`text-lg font-bold ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Синк / Авто-выпуск ── */}
      <SectionTitle id="sync">Синхронизация</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {/* MEXC */}
        <div className="rounded-lg border p-2.5 space-y-1.5"
          style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus?.mexc.running ? "bg-yellow-400 animate-pulse" : syncStatus?.mexc.enabled ? "bg-green-400" : "bg-muted-foreground"}`} />
              <span className="text-xs font-medium">MEXC C2C</span>
            </div>
            <button onClick={() => handleSync("mexc")} disabled={syncing === "mexc" || syncStatus?.mexc.running}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 disabled:opacity-40">
              {syncing === "mexc" ? "..." : "Синхр"}
            </button>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Найдено: {syncStatus?.mexc.lastResult?.totalFetched ?? 0}</span>
            <span>Импорт: {syncStatus?.mexc.lastResult?.imported ?? 0}</span>
          </div>
        </div>
        {/* Bybit */}
        <div className="rounded-lg border p-2.5 space-y-1.5"
          style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus?.bybit.running ? "bg-yellow-400 animate-pulse" : syncStatus?.bybit.enabled ? "bg-green-400" : "bg-muted-foreground"}`} />
              <span className="text-xs font-medium">Bybit P2P</span>
            </div>
            <button onClick={() => handleSync("bybit")} disabled={syncing === "bybit" || syncStatus?.bybit.running}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 disabled:opacity-40">
              {syncing === "bybit" ? "..." : "Синхр"}
            </button>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Найдено: {syncStatus?.bybit.lastResult?.totalFetched ?? 0}</span>
            <span>Импорт: {syncStatus?.bybit.lastResult?.imported ?? 0}</span>
          </div>
        </div>
      </div>
      {/* Авто-выпуск — все биржи */}
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-1">Авто-выпуск</p>
      <div className="grid grid-cols-4 gap-2">
        {EXCHANGES.map(ex => {
          const st = allAutoRelease?.[ex.toLowerCase()];
          const isToggling = arToggling === ex;
          return (
            <div key={ex} className="rounded-lg border p-2 flex flex-col gap-1.5 transition-colors"
              style={st?.enabled
                ? { background: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.35)" }
                : { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" }}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <img src={EXCHANGE_ICON[ex.toLowerCase()]} alt="" className="w-3.5 h-3.5 rounded-sm object-contain flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-[11px] font-semibold leading-none">{ex}</span>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st?.running ? "bg-yellow-400 animate-pulse" : st?.enabled ? "bg-green-400" : "bg-muted-foreground/40"}`} />
              </div>
              {/* Count */}
              {st?.enabled && (
                <div className="text-[9px] text-green-400 font-medium">↑ {st.releasedCount}</div>
              )}
              {/* Action */}
              {st?.supported ? (
                <button onClick={() => toggleAutoRelease(ex)} disabled={isToggling}
                  className={`w-full text-[10px] py-0.5 rounded border font-semibold disabled:opacity-50 transition-colors ${st?.enabled ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-green-500/10 text-green-400 border-green-500/30"}`}>
                  {isToggling ? "..." : st?.enabled ? "Выкл" : "Вкл"}
                </button>
              ) : (
                <div className="text-[9px] text-muted-foreground/60 text-center truncate" title={st?.reason ?? "нет API"}>
                  {st?.reason ?? "нет API"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Активные сделки ── */}
      {activeTrades.length > 0 && (
        <>
          <SectionTitle id="active">Активные сделки — {activeTrades.length}</SectionTitle>
          <div className="space-y-2">
            {activeTrades.map(trade => (
              <TradeCard key={trade.id} trade={trade}
                onConfirm={() => confirmMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                onRelease={() => releaseMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                confirmPending={confirmMutation.isPending}
                releasePending={releaseMutation.isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Все сделки ── */}
      <SectionTitle id="trades">Сделки</SectionTitle>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {(["all","pending","paid","completed","cancelled","disputed"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
            }`}>
            {s === "all" ? "Все" : STATUS_LABEL[s]}
          </button>
        ))}
        <button onClick={() => window.open(`${BASE}api/mexc/c2c-export?format=csv`, "_blank")}
          className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/40 ml-auto whitespace-nowrap">
          CSV ↓
        </button>
      </div>

      {tradesLoading ? (
        <div className="text-center py-6 text-muted-foreground text-sm">Загрузка...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">Нет сделок по фильтру</div>
      ) : (
        <div className="space-y-2">
          {shownTrades.map(trade => (
            <TradeCard key={trade.id} trade={trade}
              onConfirm={() => confirmMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
              onRelease={() => releaseMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
              confirmPending={confirmMutation.isPending}
              releasePending={releaseMutation.isPending}
            />
          ))}
          {!isFiltered && filteredTrades.length > tradesLimit && (
            <button onClick={() => setTradesLimit(t => t + 20)}
              className="w-full py-2 text-xs text-muted-foreground border border-dashed border-border rounded-lg hover:border-primary/40 hover:text-foreground transition-colors">
              Показать ещё ({filteredTrades.length - tradesLimit} осталось)
            </button>
          )}
        </div>
      )}

      {/* ── Ордера ── */}
      <SectionTitle id="orders">Ордера</SectionTitle>
      {ordersLoading ? (
        <div className="text-center py-4 text-muted-foreground text-sm">Загрузка...</div>
      ) : (!orders || orders.length === 0) ? (
        <div className="text-center py-4 text-muted-foreground text-sm">Нет активных ордеров</div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
            <div key={order.id} className="bg-card border border-border rounded-lg p-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="font-medium">{order.asset} / {order.fiatCurrency}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${order.isActive ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-muted-foreground border-border"}`}>
                  {order.isActive ? "Активен" : "Неактивен"}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{order.side === "buy" ? "Покупка" : "Продажа"}</span>
                <span>Цена: {Number(order.price).toLocaleString("ru", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Аккаунты ── */}
      <SectionTitle id="accounts">Аккаунты</SectionTitle>
      {(!accounts || accounts.length === 0) ? (
        <div className="text-center py-4 text-muted-foreground text-sm">Нет аккаунтов</div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <div key={acc.id} className="rounded-lg border p-3 text-sm flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
              <div>
                <div className="font-medium">{acc.name}</div>
                <div className="text-xs text-muted-foreground">{acc.exchange?.toUpperCase()} · {acc.ownerName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Сделок</div>
                <div className="font-bold">{acc.completedTrades ?? 0}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Все P2P мерчанты ── */}
      <SectionTitle id="merchants">Все P2P мерчанты</SectionTitle>

      {/* Переключатель биржи */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {EXCHANGES.map(ex => {
          const brand = EXCHANGE_BRAND[ex.toLowerCase()];
          const isActive = merchantExchange === ex;
          return (
            <button key={ex} onClick={() => setMerchantExchange(ex)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap font-semibold transition-all flex-shrink-0"
              style={isActive
                ? { background: brand?.bg, color: brand?.color, borderColor: brand?.border }
                : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", borderColor: "rgba(255,255,255,0.12)" }}>
              <img src={EXCHANGE_ICON[ex.toLowerCase()]} alt="" className="w-3.5 h-3.5 rounded-sm"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              {ex}
            </button>
          );
        })}
      </div>

      {/* Кнопки покупка/продажа + фильтр по сумме */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
          {(["all", "buy", "sell"] as const).map(s => {
            const label = s === "all" ? "Все" : s === "buy" ? "▲ Покупка" : "▼ Продажа";
            const activeStyle = s === "buy"
              ? { background: "rgba(34,197,94,0.18)", color: "#22c55e", borderColor: "rgba(34,197,94,0.3)" }
              : s === "sell"
              ? { background: "rgba(239,68,68,0.18)", color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }
              : { background: "rgba(255,255,255,0.14)", color: "#fff" };
            const inactiveStyle = { background: "transparent", color: "rgba(255,255,255,0.35)" };
            return (
              <button key={s} onClick={() => setMerchantSide(s)}
                className="text-[11px] font-semibold px-3 py-1.5 transition-all"
                style={merchantSide === s ? activeStyle : inactiveStyle}>
                {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setMerchantAmountFilter(v => !v)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all flex-shrink-0"
          style={merchantAmountFilter
            ? { background: "rgba(77,166,255,0.18)", color: "#4da6ff", borderColor: "rgba(77,166,255,0.35)" }
            : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.12)" }}>
          130к–9.9М ₫
        </button>
      </div>

      {/* Ордера / объявления выбранной биржи */}
      {(() => {
        const brand = EXCHANGE_BRAND[merchantExchange.toLowerCase()];
        const accent = brand?.color ?? "#4da6ff";

        // ── Bybit: грузим объявления напрямую с API ──
        if (merchantExchange === "Bybit") {
          if (bybitAdsLoading) return (
            <div className="text-center py-4 text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Загрузка сделок…
            </div>
          );
          if (bybitAdsError) return (
            <div className="rounded-xl border border-dashed border-red-500/30 p-4 text-center text-sm">
              <div className="text-red-400 font-semibold mb-1">⚠️ Ошибка</div>
              <div className="text-muted-foreground text-xs">{bybitAdsError}</div>
            </div>
          );
          if (!bybitTrades || bybitTrades.length === 0) return (
            <div className="text-center py-6 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm">
              Нет сделок Bybit в базе — запустите синхронизацию
            </div>
          );

          let filteredTrades = bybitTrades;
          if (merchantSide !== "all") filteredTrades = filteredTrades.filter(t => t.side === merchantSide);
          if (merchantAmountFilter) filteredTrades = filteredTrades.filter(t =>
            t.fiatAmount != null && t.fiatAmount >= AMOUNT_MIN && t.fiatAmount <= AMOUNT_MAX
          );

          const buyTrades  = filteredTrades.filter(t => t.side === "buy");
          const sellTrades = filteredTrades.filter(t => t.side === "sell");

          function BybitTradeList({ list, side }: { list: typeof bybitTrades; side: "buy" | "sell" }) {
            if (!list || list.length === 0) return null;
            const sideColor = side === "buy" ? "#22c55e" : "#ef4444";
            const sideLabel = side === "buy" ? "Покупка" : "Продажа";
            return (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: sideColor }}>
                  <span>{side === "buy" ? "▲" : "▼"}</span>{sideLabel} — {list.length}
                </div>
                {list.map(t => {
                  const stClass = STATUS_COLOR[t.status] ?? "text-muted-foreground border-white/10";
                  const stLabel = STATUS_LABEL[t.status] ?? t.status;
                  return (
                    <div key={t.id} className="rounded-lg border p-2.5 space-y-1"
                      style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{t.asset} / {t.fiatCurrency}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${stClass}`}>
                          {stLabel}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Цена: <span className="font-bold text-foreground">{Number(t.price ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}</span></span>
                        {t.amount != null && <span>Кол-во: <span className="font-semibold text-foreground">{Number(t.amount).toLocaleString("ru", { maximumFractionDigits: 4 })} {t.asset}</span></span>}
                      </div>
                      {t.fiatAmount != null && t.fiatAmount > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Сумма: <span className="font-semibold text-foreground">{Number(t.fiatAmount).toLocaleString("ru", { maximumFractionDigits: 0 })}</span> {t.fiatCurrency}
                        </div>
                      )}
                      {t.counterpartyName && (
                        <div className="text-[10px]" style={{ color: accent + "cc" }}>👤 {t.counterpartyName}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground opacity-50">
                        {new Date(t.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (filteredTrades.length === 0) return (
            <div className="text-center py-6 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm">
              Нет сделок по выбранным фильтрам
            </div>
          );

          return (
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground text-right">
                {filteredTrades.length} из {bybitTrades.length} сделок
              </div>
              <BybitTradeList list={buyTrades} side="buy" />
              <BybitTradeList list={sellTrades} side="sell" />
            </div>
          );
        }

        // ── Другие биржи: из таблицы orders ──
        let exOrders = (orders ?? []).filter(o =>
          (o.exchange ?? "").toLowerCase() === merchantExchange.toLowerCase()
        );
        if (merchantSide !== "all") exOrders = exOrders.filter(o => o.side === merchantSide);
        if (merchantAmountFilter) exOrders = exOrders.filter(o => {
          const amt = o.fiatAmount ?? o.maxAmount;
          return amt != null && Number(amt) >= AMOUNT_MIN && Number(amt) <= AMOUNT_MAX;
        });

        if (!orders) return <div className="text-center py-4 text-muted-foreground text-sm">Загрузка...</div>;
        if (exOrders.length === 0) return (
          <div className="text-center py-6 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm">
            Нет ордеров на {merchantExchange}
          </div>
        );

        const buyOrders  = exOrders.filter(o => o.side === "buy");
        const sellOrders = exOrders.filter(o => o.side === "sell");

        function OrderList({ list, side }: { list: typeof exOrders; side: "buy" | "sell" }) {
          if (list.length === 0) return null;
          const sideColor = side === "buy" ? "#22c55e" : "#ef4444";
          const sideLabel = side === "buy" ? "Покупка" : "Продажа";
          return (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                style={{ color: sideColor }}>
                <span>{side === "buy" ? "▲" : "▼"}</span>{sideLabel} — {list.length}
              </div>
              {list.map(o => (
                <div key={o.id} className="rounded-lg border p-2.5 space-y-1"
                  style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{o.asset} / {o.fiatCurrency}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${o.isActive ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-muted-foreground border-white/10"}`}>
                      {o.isActive ? "Активен" : "Выкл"}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Цена: <span className="font-bold text-foreground">{Number(o.price).toLocaleString("ru", { maximumFractionDigits: 0 })} ₫</span></span>
                    {o.availableAmount != null && (
                      <span>Доступно: <span className="font-semibold text-foreground">{Number(o.availableAmount).toLocaleString("ru", { maximumFractionDigits: 4 })}</span></span>
                    )}
                  </div>
                  {(o.minAmount != null || o.maxAmount != null) && (
                    <div className="text-[10px] text-muted-foreground">
                      Лимит: {o.minAmount != null ? Number(o.minAmount).toLocaleString("ru", { maximumFractionDigits: 0 }) : "—"} –{" "}
                      {o.maxAmount != null ? Number(o.maxAmount).toLocaleString("ru", { maximumFractionDigits: 0 }) : "—"} ₫
                    </div>
                  )}
                  {o.paymentMethod && (
                    <div className="text-[10px] text-muted-foreground truncate">💳 {o.paymentMethod}</div>
                  )}
                  {o.accountName && (
                    <div className="text-[10px]" style={{ color: accent + "cc" }}>👤 {o.accountName}</div>
                  )}
                </div>
              ))}
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="text-[10px] text-muted-foreground text-right">Всего: {exOrders.length} ордеров</div>
            <OrderList list={buyOrders} side="buy" />
            <OrderList list={sellOrders} side="sell" />
          </div>
        );
      })()}

      {/* ── SMS от MacroDroid ── */}
      <SectionTitle id="sms">SMS от банков (MacroDroid)</SectionTitle>

      {/* URL для MacroDroid */}
      <div className="rounded-xl border p-3 space-y-2"
        style={{ background: "rgba(77,166,255,0.07)", borderColor: "rgba(77,166,255,0.20)" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Webhook URL для MacroDroid</div>
        <div className="font-mono text-[11px] break-all text-foreground bg-black/30 rounded-lg px-2 py-2 select-all">
          {`${BASE}api/sms/webhook`.replace(/^\//, `${typeof window !== "undefined" ? window.location.origin : ""}/`)}
        </div>
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <div>Метод: <span className="text-foreground font-semibold">POST</span> · Content-Type: <span className="text-foreground font-semibold">application/json</span></div>
          <div>Тело: <span className="font-mono text-blue-300">{`{"body": "[Сообщение]", "address": "[Номер]"}`}</span></div>
        </div>
      </div>

      {/* Лог */}
      {smsLoading && smsEvents.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
        </div>
      )}
      {smsEvents.length === 0 && !smsLoading && (
        <div className="text-center py-6 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm">
          SMS ещё не получены. Настройте MacroDroid и отправьте тестовый вебхук.
        </div>
      )}
      {smsEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">Последние {smsEvents.length} SMS · обновление каждые 15с</div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-muted-foreground">live</span>
            </div>
          </div>
          {smsEvents.map(ev => (
            <div key={ev.id} className="rounded-xl border p-3 space-y-1.5"
              style={{
                background: ev.released
                  ? "rgba(34,197,94,0.08)"
                  : ev.matched
                  ? "rgba(234,179,8,0.08)"
                  : "rgba(255,255,255,0.06)",
                borderColor: ev.released
                  ? "rgba(34,197,94,0.30)"
                  : ev.matched
                  ? "rgba(234,179,8,0.30)"
                  : "rgba(255,255,255,0.10)",
              }}>
              {/* Шапка: статус + время */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {ev.released && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-green-400 bg-green-500/10 border-green-500/30">
                      ✓ Выпущено
                    </span>
                  )}
                  {ev.matched && !ev.released && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-yellow-400 bg-yellow-500/10 border-yellow-500/30">
                      ⚡ Совпало
                    </span>
                  )}
                  {!ev.matched && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-muted-foreground border-white/10">
                      SMS
                    </span>
                  )}
                  {ev.bank && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${BANK_COLOR[ev.bank] ?? "text-muted-foreground border-white/10"}`}>
                      {ev.bank}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ev.receivedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>

              {/* Сумма */}
              {ev.amount != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-black text-foreground leading-none">
                    {ev.amount.toLocaleString("ru")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">₫</span>
                </div>
              )}

              {/* Ордер */}
              {ev.matchedOrderId && (
                <div className="text-[10px] text-yellow-400">
                  Ордер: <span className="font-mono">{ev.matchedOrderId}</span>
                  {ev.releaseResult && <span className="ml-1 text-muted-foreground">· {ev.releaseResult}</span>}
                </div>
              )}

              {/* Отправитель */}
              {ev.sender && (
                <div className="text-[10px] text-muted-foreground">📱 {ev.sender}</div>
              )}

              {/* Текст SMS */}
              <div className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-2 font-mono">
                {ev.rawText}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-4" />
      </div>{/* end px-3 space-y-4 */}
    </div>
  );
}

function TradeCard({ trade, onConfirm, onRelease, confirmPending, releasePending }: {
  trade: { id: number; side: string; asset: string; fiatCurrency: string; amount?: number | null; price?: number | null; fiatAmount?: number | null; status: string; counterpartyName?: string | null; paymentMethod?: string | null; createdAt: string; accountName?: string | null; exchange?: string | null };
  onConfirm: () => void; onRelease: () => void;
  confirmPending: boolean; releasePending: boolean;
}) {
  const exKey = (trade.exchange ?? trade.accountName ?? "").toLowerCase();
  const exchangeLabel = EXCHANGES.find(e => exKey.includes(e.toLowerCase())) ?? null;
  const exBrand = exchangeLabel ? EXCHANGE_BRAND[exchangeLabel.toLowerCase()] : null;

  return (
    <div className="rounded-lg border p-3 text-sm"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
      <div className="flex justify-between items-start mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-bold ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
            {trade.side === "buy" ? "▲ КУПЛЯ" : "▼ ПРОДАЖА"}
          </span>
          <span className="font-mono text-sm">{trade.amount?.toFixed(2)} {trade.asset}</span>
          {exchangeLabel && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase"
              style={exBrand ? { background: exBrand.bg, color: exBrand.color, borderColor: exBrand.border } : {}}
            >{exchangeLabel}</span>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_COLOR[trade.status] ?? ""}`}>
          {STATUS_LABEL[trade.status] ?? trade.status}
        </span>
      </div>

      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-muted-foreground truncate max-w-[55%]">{trade.counterpartyName ?? trade.accountName ?? "—"}</span>
        <span className="font-bold text-foreground">{trade.fiatAmount?.toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}</span>
      </div>

      {(trade.paymentMethod) && (
        <div className="text-[10px] text-muted-foreground mb-1">
          {BANKS.map(b => trade.paymentMethod?.includes(b) ? (
            <span key={b} className={`inline-block px-1.5 py-0.5 rounded border text-[10px] mr-1 ${BANK_COLOR[b]}`}>{b}</span>
          ) : null)}
          {!BANKS.some(b => trade.paymentMethod?.includes(b)) && trade.paymentMethod}
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        {new Date(trade.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
        {trade.price ? <span className="ml-2">{Number(trade.price).toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}/{trade.asset}</span> : null}
      </div>

      {(trade.status === "pending" || trade.status === "paid") && (
        <div className="flex gap-2 mt-2">
          {trade.status === "pending" && (
            <button onClick={onConfirm} disabled={confirmPending}
              className="flex-1 text-xs py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-50">
              ✓ Подтвердить оплату
            </button>
          )}
          {trade.status === "paid" && (
            <button onClick={onRelease} disabled={releasePending}
              className="flex-1 text-xs py-1.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-50">
              ↑ Выпустить крипту
            </button>
          )}
        </div>
      )}
    </div>
  );
}
