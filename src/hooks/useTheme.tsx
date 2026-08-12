import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type Ctx = { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void };

const ThemeCtx = createContext<Ctx>({ theme: "light", toggleTheme: () => {}, setTheme: () => {} });
const KEY = "via-theme";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  if (theme === "dark") {
    r.classList.add("dark");
    r.style.colorScheme = "dark";
    r.dataset.theme = "dark";
  } else {
    r.classList.remove("dark");
    r.style.colorScheme = "light";
    r.dataset.theme = "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(KEY) as Theme | null) ?? "light";
      setThemeState(stored);
      apply(stored);
    } catch {
      apply("light");
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    apply(t);
    try { localStorage.setItem(KEY, t); } catch { /* noop */ }
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return <ThemeCtx.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}