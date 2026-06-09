import { useGetDashboardStats, useListTrades } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  paid: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  disputed: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const statusLabel: Record<string, string> = {
  pending: "Ожидание",
  paid: "Оплачено",
  completed: "Завершено",
  cancelled: "Отменено",
  disputed: "Спор",
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: trades, isLoading: tradesLoading } = useListTrades({ limit: 10 });

  if (statsLoading) {
    return <div className="p-4 text-center text-muted-foreground">Загрузка...</div>;
  }

  const activeTrades = trades?.filter((t) => t.status === "pending" || t.status === "paid") ?? [];
  const recentTrades = trades?.slice(0, 8) ?? [];

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Метрики */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card p-4 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Объём сегодня</div>
          <div className="text-lg font-bold">
            {stats?.todayVolume ? stats.todayVolume.toLocaleString("ru", { maximumFractionDigits: 0 }) : "0"} ₫
          </div>
        </div>
        <div className="bg-card p-4 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Прибыль сегодня</div>
          <div className="text-lg font-bold text-green-400">
            {stats?.todayProfit ? stats.todayProfit.toLocaleString("ru", { maximumFractionDigits: 2 }) : "0"} $
          </div>
        </div>
        <div className="bg-card p-4 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Активных сделок</div>
          <div className="text-lg font-bold">{stats?.activeTrades ?? 0}</div>
        </div>
        <div className="bg-card p-4 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Всего сделок</div>
          <div className="text-lg font-bold">{stats?.completedTrades ?? 0}</div>
        </div>
      </div>

      {/* Активные сделки */}
      {activeTrades.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Активные сделки ({activeTrades.length})
          </div>
          <div className="space-y-2">
            {activeTrades.map((trade) => (
              <div key={trade.id} className="bg-card p-3 border border-border rounded-lg text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-xs font-bold ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {trade.side === "buy" ? "ПОКУПКА" : "ПРОДАЖА"}
                    </span>
                    <span className="text-muted-foreground ml-2">{trade.asset}</span>
                    {trade.accountName && (
                      <span className="ml-2 text-xs text-muted-foreground/60">{trade.accountName}</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusColor[trade.status] ?? ""}`}>
                    {statusLabel[trade.status] ?? trade.status}
                  </span>
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-muted-foreground">{trade.counterpartyName ?? "—"}</span>
                  <span className="font-bold">
                    {trade.fiatAmount?.toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Последние сделки */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Последние сделки
        </div>
        {tradesLoading ? (
          <div className="text-muted-foreground text-center py-4 text-sm">Загрузка...</div>
        ) : recentTrades.length === 0 ? (
          <div className="text-muted-foreground text-center py-8 text-sm">
            Нет сделок. Синхронизируйте аккаунты.
          </div>
        ) : (
          <div className="space-y-2">
            {recentTrades.map((trade) => (
              <div key={trade.id} className="bg-card p-3 border border-border rounded-lg text-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-xs ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {trade.side === "buy" ? "BUY" : "SELL"}
                    </span>
                    <span className="font-mono">{trade.amount?.toFixed(2)} {trade.asset}</span>
                    {trade.exchange && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded uppercase">
                        {trade.exchange}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-xs">
                      {trade.fiatAmount?.toLocaleString("ru", { maximumFractionDigits: 0 })} {trade.fiatCurrency}
                    </div>
                    <div className={`text-xs ${statusColor[trade.status] ?? "text-muted-foreground"} rounded px-1`}>
                      {statusLabel[trade.status] ?? trade.status}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
