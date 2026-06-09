import { useGetDashboardStats } from "@workspace/api-client-react";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card p-4 border border-card-border rounded-lg">
          <div className="text-xs text-muted-foreground">Volume Today</div>
          <div className="text-lg font-bold">${stats?.todayVolume?.toLocaleString()}</div>
        </div>
        <div className="bg-card p-4 border border-card-border rounded-lg">
          <div className="text-xs text-muted-foreground">Profit Today</div>
          <div className="text-lg font-bold text-success">${stats?.todayProfit?.toLocaleString()}</div>
        </div>
        <div className="bg-card p-4 border border-card-border rounded-lg">
          <div className="text-xs text-muted-foreground">Active Trades</div>
          <div className="text-lg font-bold">{stats?.activeTrades}</div>
        </div>
        <div className="bg-card p-4 border border-card-border rounded-lg">
          <div className="text-xs text-muted-foreground">Pending Payments</div>
          <div className="text-lg font-bold text-warning">{stats?.pendingPayments}</div>
        </div>
      </div>
    </div>
  );
}
