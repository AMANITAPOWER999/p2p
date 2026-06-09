import { useListOrders } from "@workspace/api-client-react";

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
      <div className="space-y-3">
        {orders?.map((order) => (
          <div key={order.id} className="bg-card p-3 border border-card-border rounded-lg text-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono">{order.asset} / {order.fiatCurrency}</span>
              <span className="text-muted-foreground">{order.side}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Price: {order.price}</span>
              <span className="font-bold">{order.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        ))}
        {(!orders || orders.length === 0) && (
          <div className="text-muted-foreground text-center py-8">No orders found.</div>
        )}
      </div>
    </div>
  );
}
