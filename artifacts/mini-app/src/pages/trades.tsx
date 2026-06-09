import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrades,
  useConfirmPayment,
  useReleaseCrypto,
  useListAccounts,
  getListTradesQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";

const statusColor: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  paid:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  disputed:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const statusLabel: Record<string, string> = {
  pending: "Ожидание", paid: "Оплачено", completed: "Завершено",
  cancelled: "Отменено", disputed: "Спор",
};

type StatusFilter = "all" | "pending" | "paid" | "completed" | "cancelled";
type View = "list" | "add" | "import" | "mexc-sync";

const BASE = import.meta.env.BASE_URL ?? "/";

export default function Trades() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<View>("list");
  const { data: trades, isLoading } = useListTrades({ status: filter });
  const { data: accounts } = useListAccounts();
  const confirmMutation = useConfirmPayment();
  const releaseMutation = useReleaseCrypto();
  const queryClient = useQueryClient();

  const [addForm, setAddForm] = useState({
    accountId: "", side: "buy", asset: "USDT", fiatCurrency: "VND",
    amount: "", price: "", fiatAmount: "", counterpartyName: "", status: "completed",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  const [csvAccountId, setCsvAccountId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvMsg, setCsvMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [syncToken, setSyncToken] = useState("");
  const [syncAccountId, setSyncAccountId] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success?: boolean; message?: string; imported?: number; skipped?: number;
    totalFetched?: number; pagesScanned?: number; errors?: string[]; rawSample?: unknown;
  } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true); setAddMsg("");
    try {
      const res = await fetch(`${BASE}api/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(addForm.accountId),
          side: addForm.side,
          asset: addForm.asset,
          fiatCurrency: addForm.fiatCurrency,
          amount: Number(addForm.amount),
          price: Number(addForm.price),
          fiatAmount: Number(addForm.fiatAmount),
          counterpartyName: addForm.counterpartyName || null,
          status: addForm.status,
        }),
      });
      if (res.ok) {
        setAddMsg("✓ Сделка добавлена");
        setAddForm({ accountId: addForm.accountId, side: "buy", asset: "USDT", fiatCurrency: "VND",
          amount: "", price: "", fiatAmount: "", counterpartyName: "", status: "completed" });
        invalidate();
      } else {
        const e = await res.json();
        setAddMsg("Ошибка: " + (e.error ?? "неизвестная"));
      }
    } catch { setAddMsg("Ошибка сети"); }
    finally { setAddLoading(false); }
  }

  async function handleCsvImport() {
    if (!csvAccountId || !csvText.trim()) { setCsvMsg("Выберите аккаунт и вставьте CSV"); return; }
    setCsvLoading(true); setCsvMsg("");
    try {
      const res = await fetch(`${BASE}api/trades/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: Number(csvAccountId), csv: csvText }),
      });
      const data = await res.json();
      if (data.success) {
        setCsvMsg(`✓ ${data.message}`);
        invalidate();
        setTimeout(() => { setView("list"); setCsvText(""); }, 1500);
      } else {
        setCsvMsg("Ошибка: " + (data.error ?? "неизвестная"));
      }
    } catch { setCsvMsg("Ошибка сети"); }
    finally { setCsvLoading(false); }
  }

  function handleFileRead(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "");
    reader.readAsText(file, "UTF-8");
  }

  async function handleMexcSync() {
    const token = syncToken.trim();
    if (!token) { setSyncResult({ success: false, message: "Введите веб-токен MEXC" }); return; }
    setSyncLoading(true); setSyncResult(null);
    try {
      const res = await fetch(`${BASE}api/mexc/c2c-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webToken: token,
          ...(syncAccountId ? { accountId: Number(syncAccountId) } : {}),
        }),
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.success && (data.imported ?? 0) > 0) {
        invalidate();
      }
    } catch (err) {
      setSyncResult({ success: false, message: "Ошибка сети: " + String(err) });
    } finally {
      setSyncLoading(false);
    }
  }

  function handleExportCSV() {
    const params = new URLSearchParams({ format: "csv" });
    if (syncAccountId) params.set("accountId", syncAccountId);
    window.open(`${BASE}api/mexc/c2c-export?${params.toString()}`, "_blank");
  }

  function handleExportJSON() {
    const params = new URLSearchParams();
    if (syncAccountId) params.set("accountId", syncAccountId);
    window.open(`${BASE}api/mexc/c2c-export?${params.toString()}`, "_blank");
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Все" }, { key: "pending", label: "Ожидание" },
    { key: "paid", label: "Оплачено" }, { key: "completed", label: "Завершено" },
  ];

  const inputCls = "w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary";
  const labelCls = "block text-xs text-muted-foreground mb-1";

  if (view === "add") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground text-sm">← Назад</button>
          <h1 className="text-xl font-bold">Добавить сделку</h1>
        </div>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className={labelCls}>Аккаунт *</label>
            <select value={addForm.accountId} onChange={e => setAddForm(f => ({...f, accountId: e.target.value}))} className={inputCls} required>
              <option value="">Выберите аккаунт</option>
              {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Сторона</label>
              <select value={addForm.side} onChange={e => setAddForm(f => ({...f, side: e.target.value}))} className={inputCls}>
                <option value="buy">Покупка</option>
                <option value="sell">Продажа</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Статус</label>
              <select value={addForm.status} onChange={e => setAddForm(f => ({...f, status: e.target.value}))} className={inputCls}>
                <option value="completed">Завершено</option>
                <option value="pending">Ожидание</option>
                <option value="paid">Оплачено</option>
                <option value="cancelled">Отменено</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Актив</label>
              <input value={addForm.asset} onChange={e => setAddForm(f => ({...f, asset: e.target.value}))} className={inputCls} placeholder="USDT" />
            </div>
            <div>
              <label className={labelCls}>Валюта</label>
              <input value={addForm.fiatCurrency} onChange={e => setAddForm(f => ({...f, fiatCurrency: e.target.value}))} className={inputCls} placeholder="VND" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Кол-во USDT *</label>
              <input type="number" step="any" value={addForm.amount} onChange={e => setAddForm(f => ({...f, amount: e.target.value}))} className={inputCls} placeholder="100" required />
            </div>
            <div>
              <label className={labelCls}>Цена за 1 *</label>
              <input type="number" step="any" value={addForm.price} onChange={e => setAddForm(f => ({...f, price: e.target.value}))} className={inputCls} placeholder="25000" required />
            </div>
            <div>
              <label className={labelCls}>Итого фиат *</label>
              <input type="number" step="any" value={addForm.fiatAmount} onChange={e => setAddForm(f => ({...f, fiatAmount: e.target.value}))} className={inputCls} placeholder="2500000" required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Контрагент</label>
            <input value={addForm.counterpartyName} onChange={e => setAddForm(f => ({...f, counterpartyName: e.target.value}))} className={inputCls} placeholder="Имя / никнейм" />
          </div>
          {addMsg && <div className={`text-xs px-3 py-2 rounded ${addMsg.startsWith("✓") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{addMsg}</div>}
          <button type="submit" disabled={addLoading} className="w-full py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {addLoading ? "Сохранение..." : "Добавить сделку"}
          </button>
        </form>
      </div>
    );
  }

  if (view === "import") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground text-sm">← Назад</button>
          <h1 className="text-xl font-bold">Импорт CSV из MEXC</h1>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground mb-1">Как экспортировать из MEXC P2P:</div>
          <div>1. MEXC → C2C Trading → Orders → Order History</div>
          <div>2. Нажать Export / Download → выбрать период</div>
          <div>3. Скачать CSV файл и загрузить сюда</div>
        </div>
        <div>
          <label className={labelCls}>Аккаунт *</label>
          <select value={csvAccountId} onChange={e => setCsvAccountId(e.target.value)} className={inputCls}>
            <option value="">Выберите аккаунт</option>
            {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>CSV файл</label>
          <input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFileRead}
            className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary cursor-pointer" />
        </div>
        <div>
          <label className={labelCls}>Или вставьте CSV текст напрямую</label>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary resize-none"
            placeholder={"Order Number,Trade Type,Crypto,Fiat Currency,Price,Amount,Total\n12345,Buy,USDT,VND,25000,100,2500000"} />
          <div className="text-xs text-muted-foreground mt-1">Строк: {csvText ? csvText.split("\n").filter(l => l.trim()).length : 0}</div>
        </div>
        {csvMsg && <div className={`text-xs px-3 py-2 rounded ${csvMsg.startsWith("✓") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{csvMsg}</div>}
        <button onClick={handleCsvImport} disabled={csvLoading || !csvAccountId || !csvText.trim()}
          className="w-full py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {csvLoading ? "Импорт..." : "Импортировать"}
        </button>
      </div>
    );
  }

  if (view === "mexc-sync") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground text-sm">← Назад</button>
          <h1 className="text-xl font-bold">Синхронизация MEXC C2C</h1>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
          <div className="font-medium text-blue-200 mb-1">Как получить веб-токен MEXC:</div>
          <div>1. Войдите в mexc.com в браузере</div>
          <div>2. Откройте DevTools → Application → Local Storage → mexc.com</div>
          <div>3. Найдите ключ <code className="bg-blue-500/20 px-1 rounded">authToken</code> или <code className="bg-blue-500/20 px-1 rounded">token</code></div>
          <div>4. Или: DevTools → Network → любой запрос → Headers → Authorization → скопируйте значение после "Bearer "</div>
        </div>

        <div>
          <label className={labelCls}>Веб-токен MEXC *</label>
          <textarea
            value={syncToken}
            onChange={e => setSyncToken(e.target.value)}
            rows={3}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary resize-none"
            placeholder="WEB8cb3ad... или eyJhbGciOiJ..."
          />
        </div>

        <div>
          <label className={labelCls}>Привязать к аккаунту (опционально)</label>
          <select value={syncAccountId} onChange={e => setSyncAccountId(e.target.value)} className={inputCls}>
            <option value="">Автоматически (найти / создать MEXC аккаунт)</option>
            {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <button
          onClick={handleMexcSync}
          disabled={syncLoading || !syncToken.trim()}
          className="w-full py-2.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {syncLoading ? "Загружаем сделки из MEXC..." : "Синхронизировать все сделки"}
        </button>

        {syncResult && (
          <div className={`rounded-lg p-3 border text-xs space-y-2 ${syncResult.success ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <div className={`font-medium ${syncResult.success ? "text-green-300" : "text-red-300"}`}>
              {syncResult.success ? "✓ Готово" : "✗ Ошибка"}
            </div>
            <div className="text-muted-foreground">{syncResult.message}</div>
            {syncResult.success && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-background rounded p-2 text-center">
                  <div className="text-lg font-bold text-foreground">{syncResult.totalFetched ?? 0}</div>
                  <div className="text-muted-foreground">Найдено</div>
                </div>
                <div className="bg-background rounded p-2 text-center">
                  <div className="text-lg font-bold text-green-400">{syncResult.imported ?? 0}</div>
                  <div className="text-muted-foreground">Импорт.</div>
                </div>
                <div className="bg-background rounded p-2 text-center">
                  <div className="text-lg font-bold text-muted-foreground">{syncResult.skipped ?? 0}</div>
                  <div className="text-muted-foreground">Дублик.</div>
                </div>
              </div>
            )}
            {syncResult.rawSample && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ответ API (debug)</summary>
                <pre className="mt-2 bg-background rounded p-2 text-xs overflow-auto max-h-48 text-muted-foreground">
                  {JSON.stringify(syncResult.rawSample, null, 2)}
                </pre>
              </details>
            )}
            {syncResult.errors && syncResult.errors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-red-400">Ошибки ({syncResult.errors.length})</summary>
                <ul className="mt-1 space-y-1">
                  {syncResult.errors.map((e, i) => <li key={i} className="text-red-300">{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="text-xs text-muted-foreground mb-3 font-medium">Экспорт сделок из базы данных</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportCSV}
              className="py-2 rounded border border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              Скачать CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="py-2 rounded border border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              Скачать JSON
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Сделки</h1>
        <div className="flex gap-2">
          <button onClick={() => setView("mexc-sync")}
            className="text-xs px-2.5 py-1.5 rounded border border-orange-500/30 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 transition-colors">
            MEXC Sync
          </button>
          <button onClick={() => setView("import")}
            className="text-xs px-2.5 py-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 transition-colors">
            CSV
          </button>
          <button onClick={() => setView("add")}
            className="text-xs px-2.5 py-1.5 rounded bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors">
            + Добавить
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              filter === f.key ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:border-primary/50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-4 text-sm">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {trades?.map((trade) => (
            <div key={trade.id} className="bg-card p-3 border border-border rounded-lg text-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xs ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                    {trade.side === "buy" ? "ПОКУПКА" : "ПРОДАЖА"}
                  </span>
                  <span className="font-mono">{trade.amount?.toFixed(2)} {trade.asset}</span>
                  {trade.exchange && <span className="text-xs bg-muted px-1.5 py-0.5 rounded uppercase">{trade.exchange}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${statusColor[trade.status] ?? ""}`}>
                  {statusLabel[trade.status] ?? trade.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                <span>{trade.accountName ?? "—"}</span>
                <span className="font-bold text-foreground">
                  {trade.fiatAmount?.toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}
                </span>
              </div>
              {trade.counterpartyName && (
                <div className="text-xs text-muted-foreground mb-1">
                  Контрагент: <span className="text-foreground">{trade.counterpartyName}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {new Date(trade.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
                {trade.price ? <span className="ml-3">Цена: {Number(trade.price).toLocaleString("ru", { maximumFractionDigits: 0 })}</span> : null}
              </div>
              {(trade.status === "pending" || trade.status === "paid") && (
                <div className="flex gap-2 mt-3">
                  {trade.status === "pending" && (
                    <button onClick={() => confirmMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                      disabled={confirmMutation.isPending}
                      className="flex-1 text-xs px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                      Подтвердить оплату
                    </button>
                  )}
                  {trade.status === "paid" && (
                    <button onClick={() => releaseMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                      disabled={releaseMutation.isPending}
                      className="flex-1 text-xs px-3 py-1.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-50">
                      Выпустить крипту
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {(!trades || trades.length === 0) && (
            <div className="text-center py-10 space-y-3">
              <div className="text-muted-foreground text-sm">Сделок нет</div>
              <div className="flex gap-2 justify-center flex-wrap">
                <button onClick={() => setView("mexc-sync")}
                  className="text-xs px-3 py-2 rounded border border-orange-500/30 text-orange-400 bg-orange-500/10">
                  Синхронизация MEXC
                </button>
                <button onClick={() => setView("import")}
                  className="text-xs px-3 py-2 rounded border border-border text-muted-foreground hover:border-primary/50">
                  Импорт CSV
                </button>
                <button onClick={() => setView("add")}
                  className="text-xs px-3 py-2 rounded bg-primary/10 text-primary border border-primary/30">
                  + Добавить вручную
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
