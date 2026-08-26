"use client";
import { ReactNode, useEffect, useRef, useState } from "react";

export interface ExportMenuOption {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface ExportMenuProps {
  options: ExportMenuOption[];
  /** Nothing to export — the trigger stays inert. */
  disabled?: boolean;
  /** An export is running — the trigger shows `busyLabel` and stays inert. */
  busy?: boolean;
  label?: string;
  busyLabel?: string;
  icon?: ReactNode;
  triggerClassName?: string;
  triggerTestId?: string;
}

export default function ExportMenu({
  options,
  disabled = false,
  busy = false,
  label = "Export",
  busyLabel = "Exporting…",
  icon,
  triggerClassName = "",
  triggerTestId,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={triggerTestId}
        className={triggerClassName}
      >
        {busy ? busyLabel : (<>{icon}{label}</>)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Export options"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-200 bg-white py-1 z-20 animate-fade-in"
          style={{ boxShadow: "var(--shadow-card-hover)" }}
        >
          {options.map((opt, i) => (
            <button
              key={opt.key}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              onClick={() => { close(); opt.onSelect(); }}
              className="w-full flex items-start gap-2.5 px-3 py-2 min-h-[44px] md:min-h-0 text-left text-xs text-ink hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
            >
              <span className="text-amber-700 shrink-0 mt-0.5">{opt.icon}</span>
              <span className="min-w-0">
                <span className="block font-medium">{opt.label}</span>
                {opt.description && <span className="block text-stone-600 mt-0.5">{opt.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
