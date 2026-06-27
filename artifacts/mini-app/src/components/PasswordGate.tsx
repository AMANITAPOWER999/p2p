import { useState, useEffect } from "react";

const SESSION_KEY = "tm_auth";
const CORRECT = btoa("Avatar#76");

export function useAuth() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === CORRECT);
  function unlock(pwd: string) {
    if (btoa(pwd) === CORRECT) {
      sessionStorage.setItem(SESSION_KEY, CORRECT);
      setAuthed(true);
      return true;
    }
    return false;
  }
  return { authed, unlock };
}

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const { authed, unlock } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  if (authed) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (unlock(input)) return;
    setError(true);
    setShake(true);
    setInput("");
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setError(false), 2500);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className={`w-full max-w-xs space-y-6 transition-all ${shake ? "animate-shake" : ""}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg">
            <img src="/logo.png" alt="TM" className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div className="text-center">
            <div className="text-xl font-black tracking-tight"
              style={{ background: "linear-gradient(90deg,#4da6ff,#f7a600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              TURBO MAMMOTH
            </div>
            <div className="text-[11px] text-muted-foreground tracking-widest uppercase mt-0.5">P2P Trading &amp; Bot</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Пароль</label>
            <div className="relative">
              <input
                autoFocus
                type={show ? "text" : "password"}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Введите пароль"
                className={`w-full rounded-xl border px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all pr-10 ${
                  error
                    ? "border-red-500/60 bg-red-500/10 focus:ring-red-500/30"
                    : "focus:ring-primary/30"
                }`}
                style={!error ? { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" } : {}}
              />
              <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs transition-colors">
                {show ? "🙈" : "👁️"}
              </button>
            </div>
            {error && (
              <div className="text-[11px] text-red-400 flex items-center gap-1.5">
                <span>⚠️</span> Неверный пароль
              </div>
            )}
          </div>

          <button type="submit" disabled={!input}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(90deg,#4da6ff,#f7a600)", color: "#fff" }}>
            Войти
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
