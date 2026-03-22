"use client";

import { useState, useEffect } from "react";
import type { OrbIntensity } from "@/components/GoldenOrb";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface TimeTheme {
  background:    string;
  surface:       string;
  card:          string;
  cardBorder:    string;
  textPrimary:   string;
  textSecondary: string;
  textMuted:     string;
  orbIntensity:  OrbIntensity;
}

export interface UseTimeThemeResult {
  theme:     TimeTheme;
  timeOfDay: TimeOfDay;
  greeting:  string;
}

const THEMES: Record<TimeOfDay, TimeTheme> = {
  morning: {
    background:    "#F4F7F9",
    surface:       "#E8EFF4",
    card:          "#FFFFFF",
    cardBorder:    "rgba(120,170,210,0.2)",
    textPrimary:   "#1A2530",
    textSecondary: "#4A6878",
    textMuted:     "#8AAABB",
    orbIntensity:  "medium",
  },
  afternoon: {
    background:    "#FDFAF0",
    surface:       "#F5EDD6",
    card:          "#FFFCF0",
    cardBorder:    "rgba(239,159,39,0.25)",
    textPrimary:   "#2D1A00",
    textSecondary: "#7A5520",
    textMuted:     "#C49840",
    orbIntensity:  "low",
  },
  evening: {
    background:    "#1A1008",
    surface:       "#231508",
    card:          "#2A1A0A",
    cardBorder:    "rgba(239,159,39,0.2)",
    textPrimary:   "#F5EDD6",
    textSecondary: "#C4883A",
    textMuted:     "#8A6A2A",
    orbIntensity:  "high",
  },
  night: {
    background:    "#0F0E09",
    surface:       "#1A1808",
    card:          "#1E1C0F",
    cardBorder:    "rgba(239,159,39,0.15)",
    textPrimary:   "#F5EDD6",
    textSecondary: "#8A7A52",
    textMuted:     "#4A4232",
    orbIntensity:  "high",
  },
};

const GREETINGS: Record<TimeOfDay, string> = {
  morning:   "Good Morning",
  afternoon: "Good Afternoon",
  evening:   "Good Evening",
  night:     "Still Up?",
};

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5  && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

const DEBUG_KEY = "ember_theme_debug";

export function setDebugTheme(tod: TimeOfDay | null) {
  if (typeof window === "undefined") return;
  if (tod) localStorage.setItem(DEBUG_KEY, tod);
  else localStorage.removeItem(DEBUG_KEY);
  window.dispatchEvent(new Event("ember-theme-debug"));
}

function getEffective(): TimeOfDay {
  if (typeof window === "undefined") return "night";
  const debug = localStorage.getItem(DEBUG_KEY) as TimeOfDay | null;
  if (debug && debug in THEMES) return debug;
  return getTimeOfDay(new Date().getHours());
}

export { THEMES };

export function useTimeTheme(): UseTimeThemeResult {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getEffective);

  useEffect(() => {
    const tick = () => setTimeOfDay(getEffective());
    tick();
    const id = setInterval(tick, 60_000);
    window.addEventListener("ember-theme-debug", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("ember-theme-debug", tick);
    };
  }, []);

  return {
    theme:     THEMES[timeOfDay],
    timeOfDay,
    greeting:  GREETINGS[timeOfDay],
  };
}
