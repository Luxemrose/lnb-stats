import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Preferencias de cada visitante (se guardan en su navegador; si no hay almacenamiento, duran la sesión). */
export type ThemePref = "dark" | "light" | "system";

interface Prefs {
  theme: ThemePref;
  resolvedTheme: "dark" | "light";
  setTheme: (t: ThemePref) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const PrefsCtx = createContext<Prefs | null>(null);

function read(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}

function systemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => read("lnb-theme", "dark") as ThemePref);
  const [system, setSystem] = useState(systemTheme);
  const [sidebarCollapsed, setCollapsed] = useState(() => read("lnb-sidebar", "open") === "collapsed");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => setSystem(systemTheme());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolvedTheme = theme === "system" ? system : theme;
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#10141D" : "#F4F6FA");
  }, [resolvedTheme]);

  return (
    <PrefsCtx.Provider value={{
      theme, resolvedTheme,
      setTheme: (t) => { write("lnb-theme", t); setThemeState(t); },
      sidebarCollapsed,
      setSidebarCollapsed: (v) => { write("lnb-sidebar", v ? "collapsed" : "open"); setCollapsed(v); },
    }}>
      {children}
    </PrefsCtx.Provider>
  );
}

export function usePrefs() {
  const c = useContext(PrefsCtx);
  if (!c) throw new Error("usePrefs fuera de PrefsProvider");
  return c;
}
