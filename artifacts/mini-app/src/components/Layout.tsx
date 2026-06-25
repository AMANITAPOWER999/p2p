interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col text-foreground">
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
