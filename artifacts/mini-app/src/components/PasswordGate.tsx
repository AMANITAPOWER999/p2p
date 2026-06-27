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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0f1b2d 0%, #142236 40%, #1a1a2e 70%, #16213e 100%)" }}>

      {/* Декоративные круги */}
      <div className="absolute top-[-80px] right-[-60px] w-64 h-64 rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #4da6ff 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-60px] left-[-40px] w-48 h-48 rounded-full opacity-15 pointer-events-none"
        style={{ background: "radial-gradient(circle, #f7a600 0%, transparent 70%)" }} />

      <div className={`w-full max-w-xs space-y-7 relative z-10 ${shake ? "animate-shake" : ""}`}>

        {/* Логотип */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
            style={{ boxShadow: "0 0 40px rgba(77,166,255,0.25), 0 8px 32px rgba(0,0,0,0.4)" }}>
            <img
              src="/turbo-mammoth-logo.png"
              alt="Turbo Mammoth"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-center space-y-1">
            <div className="text-2xl font-black tracking-tight"
              style={{ background: "linear-gradient(90deg,#4da6ff,#f7a600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              TURBO MAMMOTH
            </div>
            <div className="text-[11px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              P2P Trading &amp; Bot
            </div>
          </div>
        </div>

        {/* Карточка входа */}
        <div className="rounded-2xl p-5 space-y-4 border"
          style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)", backdropFilter: "blur(12px)" }}>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>
                Пароль для входа
              </label>
              <div className="relative">
                <input
                  autoFocus
                  type={show ? "text" : "password"}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full rounded-xl border px-4 py-3 text-sm font-medium placeholder:text-white/20 focus:outline-none focus:ring-2 transition-all pr-10 text-white ${
                    error
                      ? "border-red-500/60 bg-red-500/10 focus:ring-red-500/30"
                      : "focus:ring-blue-400/30"
                  }`}
                  style={!error ? { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.14)" } : {}}
                />
                <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base transition-opacity opacity-50 hover:opacity-100">
                  {show ? "🙈" : "👁️"}
                </button>
              </div>
              {error && (
                <div className="text-[11px] text-red-400 flex items-center gap-1.5 font-medium">
                  <span>⚠️</span> Неверный пароль
                </div>
              )}
            </div>

            <button type="submit" disabled={!input}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30 text-white"
              style={{ background: "linear-gradient(90deg,#4da6ff,#f7a600)", boxShadow: input ? "0 4px 20px rgba(77,166,255,0.3)" : "none" }}>
              Войти →
            </button>
          </form>
        </div>
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
