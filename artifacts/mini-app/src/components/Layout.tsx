import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  ListOrdered, 
  WalletCards, 
  BarChart3 
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dash" },
    { href: "/trades", icon: ArrowRightLeft, label: "Trades" },
    { href: "/orders", icon: ListOrdered, label: "Orders" },
    { href: "/accounts", icon: WalletCards, label: "Accounts" },
    { href: "/stats", icon: BarChart3, label: "Stats" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-[60px] md:pb-0 md:pl-[80px]">
      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-card border-t border-border flex items-center justify-around z-50 md:bottom-auto md:top-0 md:right-auto md:w-[80px] md:h-screen md:flex-col md:border-t-0 md:border-r md:justify-start md:pt-4">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full md:h-20 gap-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
