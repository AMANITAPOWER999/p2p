import { useListAccounts } from "@workspace/api-client-react";

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();

  if (isLoading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
      <div className="space-y-3">
        {accounts?.map((acc) => (
          <div key={acc.id} className="bg-card p-3 border border-card-border rounded-lg text-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold">{acc.name}</span>
              <span className="text-muted-foreground">{acc.exchange}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Bal: {acc.balance || 0}</span>
              <span>{acc.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        ))}
        {(!accounts || accounts.length === 0) && (
          <div className="text-muted-foreground text-center py-8">No accounts found.</div>
        )}
      </div>
    </div>
  );
}
