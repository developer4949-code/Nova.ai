"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Sparkles } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [animating, setAnimating] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("sg-theme");
    const isDark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, []);

  const toggle = () => {
    const next = !dark;
    setAnimating(true);
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("sg-theme", next ? "dark" : "light");
    setTimeout(() => setAnimating(false), 350);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`
        relative flex h-10 w-[3.6rem] shrink-0 items-center rounded-full border-2 px-0.5 text-sm font-bold transition-all duration-300 ease-out
        ${dark
          ? "border-[rgba(76,188,174,0.35)] bg-[#1b222a]/90 text-[#4cbcae] shadow-[0_0_14px_rgba(76,188,174,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-[rgba(76,188,174,0.6)] hover:shadow-[0_0_22px_rgba(76,188,174,0.3)]"
          : "border-[rgba(185,79,67,0.35)] bg-[#f4f1ea] text-[#b94f43] shadow-[0_0_14px_rgba(185,79,67,0.12),inset_0_1px_0_rgba(255,255,255,0.5)] hover:border-[rgba(185,79,67,0.6)] hover:shadow-[0_0_22px_rgba(185,79,67,0.25)]"
        }
      `}
    >
      {/* Sliding pill background */}
      <span
        aria-hidden="true"
        className={`
          absolute top-[3px] h-[26px] w-[26px] rounded-full shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${dark ? "translate-x-[22px] bg-[#4cbcae]/20" : "translate-x-[3px] bg-[#b94f43]/15"}
        `}
      />

      {/* Sun icon (visible in dark mode, slides left) */}
      <span
        aria-hidden="true"
        className={`
          relative z-10 flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${dark ? "translate-x-[-22px] opacity-100" : "translate-x-[22px] opacity-0 scale-75"}
        `}
      >
        <Sun size={15} strokeWidth={2.2} />
      </span>

      {/* Moon icon (visible in light mode, slides right) */}
      <span
        aria-hidden="true"
        className={`
          relative z-10 flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${dark ? "translate-x-[22px] opacity-0 scale-75" : "translate-x-[-22px] opacity-100"}
        `}
      >
        <Moon size={15} strokeWidth={2.2} />
      </span>

      {/* Tiny sparkle hint */}
      <span
        aria-hidden="true"
        className={`
          absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] leading-none transition-all duration-300
          ${animating ? "scale-100 opacity-100" : "scale-50 opacity-0"}
          ${dark ? "text-[#4cbcae]" : "text-[#b94f43]"}
        `}
      >
        <Sparkles size={10} />
      </span>
    </button>
  );
}
