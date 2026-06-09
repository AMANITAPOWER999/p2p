import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTrades, useConfirmPayment, useReleaseCrypto, getListTradesQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";

const statusColor: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  paid: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  completed: "text-green-400 bg-green-500/10 border-green-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  disputed: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const statusLabel: Record<string, string> = {
  pending: "Ожидание",
  paid: "Оплачено",
  completed: "Завершено",
  cancelled: "Отменено",
  disputed: "Спор",
};

type StatusFilter = "all" | "pending" | "paid" | "completed" | "cancelled";

export default function Trades() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const { data: trades, isLoading } = useListTrades({ status: filter });
  const confirmMutation = useConfirmPayment();
  const releaseMutation = useReleaseCrypto();
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "pending", label: "Ожидание" },
    { key: "paid", label: "Оплачено" },
    { key: "completed", label: "Завершено" },
  ];

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Загрузка...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Сделки</h1>

      {/* Фильтры */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {trades?.map((trade) => (
          <div key={trade.id} className="bg-card p-3 border border-border rounded-lg text-sm">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-xs ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                  {trade.side === "buy" ? "ПОКУПКА" : "ПРОДАЖА"}
                </span>
                <span className="font-mono text-foreground">{trade.amount?.toFixed(4)} {trade.asset}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded border ${statusColor[trade.status] ?? ""}`}>
                {statusLabel[trade.status] ?? trade.status}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
              <span>{trade.accountName ?? "—"} {trade.exchange ? `(${trade.exchange.toUpperCase()})` : ""}</span>
              <span className="font-bold text-foreground">
                {trade.fiatAmount?.toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}
              </span>
            </div>

            {trade.counterpartyName && (
              <div className="text-xs text-muted-foreground mb-2">
                Контрагент: <span className="text-foreground">{trade.counterpartyName}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {new Date(trade.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
              {trade.price && (
                <span className="ml-3">Цена: {Number(trade.price).toLocaleString("ru", { maximumFractionDigits: 0 })}</span>
              )}
            </div>

            {/* Кнопки действий */}
            {(trade.status === "pending" || trade.status === "paid") && (
              <div className="flex gap-2 mt-3">
                {trade.status === "pending" && (
                  <button
                    onClick={() => confirmMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                    disabled={confirmMutation.isPending}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    Подтвердить оплату
                  </button>
                )}
                {trade.status === "paid" && (
                  <button
                    onClick={() => releaseMutation.mutate({ id: trade.id }, { onSuccess: invalidate })}
                    disabled={releaseMutation.isPending}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                  >
                    Выпустить крипту
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {(!trades || trades.length === 0) && (
          <div className="text-muted-foreground text-center py-8">
            Сделок не найдено. Синхронизируйте аккаунты.
          </div>
        )}
      </div>
    </div>
  );
}
