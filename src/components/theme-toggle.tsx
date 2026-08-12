import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

type Variant = "icon" | "row";

export function ThemeToggle({ variant = "icon" }: { variant?: Variant }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Trocar para tema claro" : "Trocar para tema escuro";

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className="via-label flex w-full items-center justify-between rounded-md px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <span>{isDark ? "Tema claro" : "Tema escuro"}</span>
        {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
    </button>
  );
}