import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
const EXCHANGES = ["OKX", "Bybit", "Binance", "Gate", "Kucoin", "Mexc"];

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

function Chip({ label, active, color, brandKey, onClick }: { label: string; active: boolean; color?: string; brandKey?: string; onClick: () => void }) {
  const brand = brandKey ? EXCHANGE_BRAND[brandKey.toLowerCase()] : null;
  const activeStyle = brand ? { background: brand.bg, color: brand.color, borderColor: brand.border } : {};
  const inactiveStyle = brand && active === false ? { borderColor: brand.border + "55", color: brand.color + "88" } : {};

  return (
    <button
      onClick={onClick}
      style={active ? activeStyle : inactiveStyle}
      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all whitespace-nowrap ${
        !brand
          ? active
            ? color ?? "bg-primary text-primary-foreground border-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          : active
            ? ""
            : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
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
  const [activeBank, setActiveBank] = useState<string | null>(null);
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tradesLimit, setTradesLimit] = useState(20);

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
    <div className="max-w-2xl mx-auto">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-b-2xl mb-4"
        style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)" }}>
        {/* Звёздная сетка */}
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle at 20% 80%, #1a3a6e 0%, transparent 50%), radial-gradient(circle at 80% 20%, #1a3a6e 0%, transparent 50%)" }} />
        <div className="relative flex items-center gap-2 px-2 pt-2 pb-1">
          <img
            src={`${import.meta.env.BASE_URL}turbo-mammoth-logo.png`}
            alt="Turbo Mammoth"
            className="w-28 h-28 object-contain flex-shrink-0"
            style={{ filter: "drop-shadow(0 0 16px rgba(77,166,255,0.4))" }}
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
            {/* Фильтры банков рядом с текстом */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide mt-1.5">
              {BANKS.map(b => (
                <Chip key={b} label={b} active={activeBank === b}
                  color={BANK_COLOR[b]}
                  onClick={() => setActiveBank(activeBank === b ? null : b)} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Фильтры бирж ── */}
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {EXCHANGES.map(ex => (
              <Chip key={ex} label={ex} active={activeExchange === ex}
                brandKey={ex}
                onClick={() => setActiveExchange(activeExchange === ex ? null : ex)} />
            ))}
            {(activeBank || activeExchange || statusFilter !== "all") && (
              <button onClick={() => { setActiveBank(null); setActiveExchange(null); setStatusFilter("all"); }}
                className="text-xs px-2.5 py-1 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 whitespace-nowrap">
                ✕ Сброс
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 space-y-4">

      <SectionTitle id="stats">Статистика</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground mb-0.5">Объём сегодня</div>
          <div className="text-lg font-bold">{(stats?.todayVolume ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })} ₫</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground mb-0.5">Прибыль сегодня</div>
          <div className="text-lg font-bold text-green-400">{(stats?.todayProfit ?? 0).toLocaleString("ru", { maximumFractionDigits: 2 })} $</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground mb-0.5">Активных</div>
          <div className="text-lg font-bold text-yellow-400">{activeTrades.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground mb-0.5">
            {(activeBank || activeExchange) ? "По фильтру" : "Всего сделок"}
          </div>
          <div className="text-lg font-bold">{filteredTrades.length}</div>
        </div>
      </div>

      {/* ── Синк / Авто-выпуск ── */}
      <SectionTitle id="sync">Синхронизация</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {/* MEXC */}
        <div className="bg-card border border-border rounded-lg p-2.5 space-y-1.5">
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
        <div className="bg-card border border-border rounded-lg p-2.5 space-y-1.5">
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
      <div className={`rounded-lg border p-2.5 flex items-center justify-between transition-colors ${autoRelease?.enabled ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"}`}>
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
            <div key={acc.id} className="bg-card border border-border rounded-lg p-3 text-sm flex items-center justify-between">
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
    <div className="bg-card border border-border rounded-lg p-3 text-sm">
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
