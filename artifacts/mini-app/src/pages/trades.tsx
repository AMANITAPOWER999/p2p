import { useListTrades } from "@workspace/api-client-react";

export default function Trades() {
  const { data: trades, isLoading } = useListTrades();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Trades</h1>
      <div className="space-y-3">
        {trades?.map((trade) => (
          <div key={trade.id} className="bg-card p-3 border border-card-border rounded-lg text-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono">{trade.asset}</span>
              <span className="text-muted-foreground">{trade.status}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{trade.counterpartyName || 'Unknown'}</span>
              <span className="font-bold">{trade.fiatAmount} {trade.fiatCurrency}</span>
            </div>
          </div>
        ))}
        {(!trades || trades.length === 0) && (
          <div className="text-muted-foreground text-center py-8">No trades found.</div>
        )}
      </div>
    </div>
  );
}
