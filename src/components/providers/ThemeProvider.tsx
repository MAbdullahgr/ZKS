"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  startTransition,
} from "react";

type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  const resolveTheme = useCallback((t: Theme): "light" | "dark" => {
    if (t === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return t;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("zkr-theme") as Theme | null;
    const initialTheme = saved || "system";
    const resolved = resolveTheme(initialTheme);

    // Apply to DOM immediately (no setState here)
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);

    // Batch state updates via startTransition to avoid cascading renders
    startTransition(() => {
      setThemeState(initialTheme);
      setResolvedTheme(resolved);
      setMounted(true);
    });
  }, [resolveTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      const resolved = resolveTheme(newTheme);

      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);

      startTransition(() => {
        setThemeState(newTheme);
        setResolvedTheme(resolved);
      });

      localStorage.setItem("zkr-theme", newTheme);
      document.cookie = `theme=${newTheme};path=/;max-age=31536000`;
    },
    [resolveTheme],
  );

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);
      startTransition(() => {
        setResolvedTheme(resolved);
      });
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
