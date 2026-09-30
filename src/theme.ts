/**
 * Theme state. The choice is stamped on <html data-theme> so CSS resolves it
 * without React, and remembered in localStorage. "system" stamps nothing and
 * lets prefers-color-scheme decide.
 */
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "femtoxml.theme";

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Private browsing or blocked storage — fall through to the system default.
  }
  return "system";
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** Applied before React mounts so the first paint is already the right theme. */
export function initTheme() {
  apply(readStored());
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [choice]);

  /** What is actually on screen right now, with "system" resolved. */
  const resolved: Exclude<ThemeChoice, "system"> =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;

  const toggle = useCallback(() => {
    setChoice((prev) => {
      if (prev === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "light"
          : "dark";
      }
      return prev === "dark" ? "light" : "dark";
    });
  }, []);

  return { choice, resolved, setChoice, toggle };
}
