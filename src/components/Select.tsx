"use client";

import { useState, useRef, useEffect } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
}

export function Select({
  value,
  onChange,
  options,
  className = "",
  placeholder,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? placeholder ?? "";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Scroll selected option into view when opening
  useEffect(() => {
    if (isOpen && listRef.current) {
      const selected = listRef.current.querySelector("[data-selected]");
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((o) => !o);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const next =
        e.key === "ArrowDown"
          ? Math.min(idx + 1, options.length - 1)
          : Math.max(idx - 1, 0);
      onChange(options[next].value);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent cursor-pointer text-left"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-2 flex-shrink-0 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-bg-primary border border-border rounded shadow-lg max-h-60 overflow-y-auto"
        >
          {options.map((option) => (
            <div
              key={option.value}
              data-selected={option.value === value ? "" : undefined}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                option.value === value
                  ? "bg-accent/15 text-accent"
                  : "text-text-primary hover:bg-bg-hover"
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
