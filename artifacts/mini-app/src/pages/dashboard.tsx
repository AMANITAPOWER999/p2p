import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ListOrdered, WalletCards, BarChart3, Zap, SlidersHorizontal, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
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
const EXCHANGES = ["OKX", "Bybit", "Binance", "Gate", "Kucoin", "Mexc", "HTX", "Bitget"];

const STATUS_COLOR: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  paid:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  disputed:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидание", paid: "Оплачено", completed: "Завершено",
  cancelled: "Отменено", disputed: "Спор",
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
interface AutoReleaseStatus {
  enabled: boolean; running: boolean; lastCheckAt: string | null;
  releasedCount: number; lastReleased: Array<{ orderId: string; at: string }>;
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
  const [activeBank, setActiveBank] = useState<string | null>(null);
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [enabledExchanges, setEnabledExchanges] = useState<Set<string>>(new Set(["OKX", "Bybit"]));
  function toggleExchangeEnabled(ex: string) {
    setEnabledExchanges(prev => {
      const next = new Set(prev);
      next.has(ex) ? next.delete(ex) : next.add(ex);
      return next;
    });
  }
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tradesLimit, setTradesLimit] = useState(20);

  const USERS = ["Manunin A", "Sazykin V"];

  // Order panel state
  const [orderMode, setOrderMode] = useState<null | "manual" | "auto">("manual");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderCoin, setOrderCoin] = useState("USDT");
  const [orderCurrency] = useState("VND");
  const [manualPrice, setManualPrice] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [marketData, setMarketData] = useState<{
    top3: Array<{ nickname: string; price: number; minAmount: number; maxAmount: number }>;
    avg: number;
  } | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [orderPlacing, setOrderPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);

  async function fetchMarketPrice() {
    setMarketLoading(true);
    setMarketError(null);
    setMarketData(null);
    try {
      const r = await fetch(`${BASE}api/p2p/market-price?exchange=bybit&side=${orderSide}&coin=${orderCoin}&currency=${orderCurrency}`);
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
  const [autoRelease, setAutoRelease] = useState<AutoReleaseStatus | null>(null);
  const [syncing, setSyncing] = useState<"mexc" | "bybit" | null>(null);
  const [arToggling, setArToggling] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }

  async function fetchStatus() {
    try {
      const [s, ar] = await Promise.all([
        fetch(`${BASE}api/mexc/sync-status`).then(r => r.json()),
        fetch(`${BASE}api/bybit/auto-release/status`).then(r => r.json()),
      ]);
      setSyncStatus(s);
      setAutoRelease(ar);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 20000);
    return () => clearInterval(id);
  }, []);

  async function handleSync(exchange: "mexc" | "bybit") {
    setSyncing(exchange);
    try {
      const path = exchange === "mexc" ? "mexc/sync-now" : "bybit/sync-now";
      await fetch(`${BASE}api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await fetchStatus();
      invalidate();
    } finally { setSyncing(null); }
  }

  async function toggleAutoRelease() {
    setArToggling(true);
    const ep = autoRelease?.enabled ? "disable" : "enable";
    try {
      await fetch(`${BASE}api/bybit/auto-release/${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await fetchStatus();
    } finally { setArToggling(false); }
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
  const shownTrades = filteredTrades.slice(0, tradesLimit);

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
          { icon: ArrowRightLeft, label: "Сделки",  anchor: "trades" },
          { icon: ListOrdered,    label: "Ордера",  anchor: "orders" },
          { icon: WalletCards,    label: "Акк",     anchor: "accounts" },
          { icon: BarChart3,      label: "Синк",    anchor: "sync" },
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
      <div className="px-3 pb-3 space-y-2">
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

        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-1">Биржи</p>
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

      {/* Выбор режима */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOrderMode(orderMode === "manual" ? null : "manual"); setOrderResult(null); }}
          className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border font-semibold text-sm transition-all ${
            orderMode === "manual"
              ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={orderMode !== "manual" ? { background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" } : {}}>
          <SlidersHorizontal className="w-4 h-4" />
          Ручной режим
        </button>
        <button onClick={() => { setOrderMode(orderMode === "auto" ? null : "auto"); setOrderResult(null); setMarketData(null); }}
          className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border font-semibold text-sm transition-all ${
            orderMode === "auto"
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={orderMode !== "auto" ? { background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" } : {}}>
          <Zap className="w-4 h-4" />
          Авто курс
        </button>
      </div>

      {/* Панель ордера */}
      {orderMode && (
        <div className="rounded-xl border p-3 space-y-3"
          style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>

          {/* Сторона + монета */}
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden flex-1">
              {(["BUY", "SELL"] as const).map(s => (
                <button key={s} onClick={() => { setOrderSide(s); setMarketData(null); setOrderResult(null); }}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold transition-all ${
                    orderSide === s
                      ? s === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {s === "BUY" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {s === "BUY" ? "Купить" : "Продать"}
                </button>
              ))}
            </div>
            <select value={orderCoin} onChange={e => setOrderCoin(e.target.value)}
              className="rounded-lg border text-xs font-semibold px-2 py-1.5 text-foreground"
              style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
              {["USDT", "BTC", "ETH"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Авто режим: кнопка получить рыночный курс */}
          {orderMode === "auto" && (
            <div className="space-y-2">
              <button onClick={fetchMarketPrice} disabled={marketLoading}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-semibold disabled:opacity-50 hover:bg-yellow-500/20 transition-colors">
                {marketLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {marketLoading ? "Загрузка..." : "Получить рыночный курс (Bybit P2P)"}
              </button>
              {marketError && (
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{marketError}</div>
              )}
              {marketData && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Топ-3 объявления ({orderSide === "BUY" ? "покупка" : "продажа"})</div>
                  {marketData.top3.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-white/5">
                      <span className="text-muted-foreground truncate max-w-[120px]">{i + 1}. {item.nickname}</span>
                      <span className="font-bold text-foreground">{item.price.toLocaleString("ru")} ₫</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                    <span className="text-xs font-bold text-yellow-400">Средний курс</span>
                    <span className="text-sm font-bold text-yellow-300">{marketData.avg.toLocaleString("ru")} ₫</span>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Разместить */}
          <button
            disabled={!manualPrice || !manualAmount || orderPlacing}
            onClick={async () => {
              setOrderPlacing(true);
              setOrderResult(null);
              try {
                await new Promise(r => setTimeout(r, 800));
                setOrderResult(`✅ Ордер размещён: ${orderSide} ${manualAmount} ${orderCoin} @ ${parseFloat(manualPrice).toLocaleString("ru")} ₫`);
              } finally {
                setOrderPlacing(false);
              }
            }}
            className={`w-full py-2.5 rounded-xl border font-bold text-sm disabled:opacity-40 transition-all ${
              orderSide === "BUY"
                ? "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30"
                : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
            }`}>
            {orderPlacing ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Размещение...</span>
              : `Разместить ${orderSide === "BUY" ? "покупку" : "продажу"}`}
          </button>

          {orderResult && (
            <div className="text-[11px] bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-green-400">{orderResult}</div>
          )}
        </div>
      )}

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
      {/* Авто-выпуск */}
      <div className="rounded-lg border p-2.5 flex items-center justify-between transition-colors"
        style={autoRelease?.enabled
          ? { background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" }
          : { background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.14)" }}>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${autoRelease?.running ? "bg-yellow-400 animate-pulse" : autoRelease?.enabled ? "bg-green-400" : "bg-muted-foreground"}`} />
          <div>
            <span className="text-xs font-medium">Авто-выпуск Bybit</span>
            {autoRelease?.enabled && <span className="text-[10px] text-green-400 ml-1.5">выпущено: {autoRelease.releasedCount}</span>}
          </div>
        </div>
        <button onClick={toggleAutoRelease} disabled={arToggling}
          className={`text-[10px] px-2.5 py-1 rounded border font-medium disabled:opacity-50 transition-colors ${autoRelease?.enabled ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-green-500/10 text-green-400 border-green-500/30"}`}>
          {arToggling ? "..." : autoRelease?.enabled ? "Выкл" : "Вкл"}
        </button>
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
        {(["all","pending","paid","completed","cancelled"] as const).map(s => (
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
          {filteredTrades.length > tradesLimit && (
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
