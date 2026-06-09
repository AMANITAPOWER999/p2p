import { useState } from "react";
import { useListAccounts, useSyncAccount } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAccountsQueryKey, getListTradesQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";

const exchangeColor: Record<string, string> = {
  mexc: "text-blue-400",
  bybit: "text-yellow-400",
};

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const syncMutation = useSyncAccount();
  const queryClient = useQueryClient();
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncResults, setSyncResults] = useState<Record<number, string>>({});

  async function handleSync(id: number) {
    setSyncingId(id);
    try {
      const result = await syncMutation.mutateAsync({ id });
      setSyncResults((prev) => ({ ...prev, [id]: (result as { message?: string }).message ?? "Готово" }));
      // Инвалидируем кеш сделок и дашборда
      queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    } catch {
      setSyncResults((prev) => ({ ...prev, [id]: "Ошибка синхронизации" }));
    } finally {
      setSyncingId(null);
    }
  }

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Загрузка...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Аккаунты</h1>
      <div className="space-y-3">
        {accounts?.map((acc) => (
          <div key={acc.id} className="bg-card p-4 border border-border rounded-lg text-sm">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-bold">{acc.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{acc.ownerName} · {acc.bankName}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`font-bold uppercase text-xs ${exchangeColor[acc.exchange] ?? ""}`}>
                  {acc.exchange}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${acc.isActive ? "text-green-400" : "text-muted-foreground"}`}>
                  {acc.isActive ? "Активен" : "Неактивен"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
              <div>
                Баланс: <span className="text-foreground font-mono">{acc.balance != null ? `${acc.balance.toFixed(2)} USDT` : "—"}</span>
              </div>
              <div>
                Сделок: <span className="text-foreground">{acc.completedTrades ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${acc.apiKeySet ? "bg-green-400" : "bg-red-400"}`} />
                <span className="text-xs text-muted-foreground">
                  {acc.apiKeySet ? "API ключ подключён" : "API ключ не настроен"}
                </span>
              </div>
              {acc.apiKeySet && (
                <button
                  onClick={() => handleSync(acc.id)}
                  disabled={syncingId === acc.id}
                  className="text-xs px-3 py-1.5 rounded bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncingId === acc.id ? "Синхронизация..." : "Синхронизировать"}
                </button>
              )}
            </div>

            {syncResults[acc.id] && (
              <div className="mt-2 text-xs text-green-400 bg-green-500/10 rounded px-2 py-1">
                {syncResults[acc.id]}
              </div>
            )}
          </div>
        ))}
        {(!accounts || accounts.length === 0) && (
          <div className="text-muted-foreground text-center py-8">Аккаунты не найдены.</div>
        )}
      </div>
    </div>
  );
}
