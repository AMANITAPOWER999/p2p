import { useLocation } from "wouter";
import { LayoutDashboard, ArrowRightLeft, ListOrdered, WalletCards, BarChart3 } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

const NAV = [
  { href: "/",        icon: LayoutDashboard, label: "Главная", anchor: null },
  { href: "/#trades", icon: ArrowRightLeft,  label: "Сделки",  anchor: "trades" },
  { href: "/#orders", icon: ListOrdered,     label: "Ордера",  anchor: "orders" },
  { href: "/#accounts",icon: WalletCards,    label: "Акк",     anchor: "accounts" },
  { href: "/#sync",   icon: BarChart3,       label: "Синк",    anchor: "sync" },
];

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  function scrollTo(anchor: string | null) {
    if (!anchor) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-[60px] md:pb-0 md:pl-[72px]">
      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-card/95 backdrop-blur border-t border-border flex items-center justify-around z-50 md:bottom-auto md:top-0 md:right-auto md:w-[72px] md:h-screen md:flex-col md:border-t-0 md:border-r md:justify-start md:pt-4 md:gap-1">
        {NAV.map((item) => {
          const isActive = location === "/" || location === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => scrollTo(item.anchor)}
              className={`flex flex-col items-center justify-center w-full h-full md:h-16 gap-1 transition-colors ${
                isActive && item.href === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
