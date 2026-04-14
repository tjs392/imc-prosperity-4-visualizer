"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = "Select",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      if (selected.length === 1) return;
      onChange(selected.filter((x) => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  let label = placeholder;
  if (selected.length === 1) label = selected[0];
  else if (selected.length > 1) label = `${selected.length} selected`;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs hover:border-neutral-400 focus:border-neutral-300 focus:outline-none min-w-[180px] text-left flex items-center justify-between gap-2"
      >
        <span className="truncate">{label}</span>
        <span className="text-neutral-500 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 min-w-[220px] border border-neutral-600 bg-[#2a2d31] shadow-lg">
          {options.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`w-full px-2 py-1.5 text-xs text-left flex items-center gap-2 hover:bg-neutral-700 ${
                  isSelected ? "text-neutral-100" : "text-neutral-400"
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 border text-center text-[10px] leading-3 ${
                    isSelected
                      ? "border-neutral-300 bg-neutral-600 text-neutral-100"
                      : "border-neutral-600 bg-[#2a2d31]"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}