"use client";

import { useEffect } from "react";
import { useTimeTheme } from "@/lib/useTimeTheme";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTimeTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--background",     theme.background);
    root.style.setProperty("--surface",        theme.surface);
    root.style.setProperty("--card",           theme.card);
    root.style.setProperty("--card-border",    theme.cardBorder);
    root.style.setProperty("--text-primary",   theme.textPrimary);
    root.style.setProperty("--text-secondary", theme.textSecondary);
    root.style.setProperty("--text-muted",     theme.textMuted);
  }, [theme]);

  return <>{children}</>;
}
