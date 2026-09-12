"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A text field with suggestions, where anything typed is still accepted.
 *
 * This replaces `<input list>` with a `<datalist>`. That is the obvious
 * way to do it and it does not work on a phone: Safari on iOS ignores the
 * element entirely, and Android renders it inconsistently. On desktop the
 * suggestions appeared; on the device this app is actually used on, the
 * field looked like a plain text box with no hint that a list existed.
 *
 * So the list is drawn here rather than left to the browser. The value is
 * never constrained to it -- the first car through the gate with a
 * re-badged import has to be typeable, which was the point of a combobox
 * over a dropdown in the first place.
 */
export function Combobox({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder,
  autoCapitalize = "words",
  invalid,
  className,
  emptyHint,
}: {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  autoCapitalize?: "none" | "words" | "characters";
  invalid?: boolean;
  className?: string;
  /** Shown when nothing matches, to say that typing freely is fine. */
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 50);

    // Anything starting with what was typed first, then anything
    // containing it -- so "civ" puts Civic above Pacifica.
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const contains = options.filter(
      (o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q),
    );
    return [...starts, ...contains].slice(0, 50);
  }, [options, value]);

  // An exact match needs no list; the answer is already in the box.
  const settled = matches.length === 1 && matches[0].toLowerCase() === value.trim().toLowerCase();
  const showList = open && matches.length > 0 && !settled;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(option: string) {
    onValueChange(option);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showList) {
      if (event.key === "ArrowDown") setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[active] ?? value);
    }
  }

  return (
    <div ref={wrapper} className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-11 w-full rounded-lg border border-line-strong bg-surface pl-3 pr-9 text-ink",
          "placeholder:text-ink-subtle transition-[border-color,box-shadow]",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
          invalid && "border-danger focus:border-danger focus:ring-danger/25",
          className,
        )}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label="Show suggestions"
        onPointerDown={(e) => {
          // Keep focus in the field so the keyboard does not flicker.
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="absolute right-0 top-0 flex h-11 w-9 items-center justify-center text-ink-subtle"
      >
        <ChevronDown
          className={cn("size-4 transition-transform duration-200", showList && "rotate-180")}
        />
      </button>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "glass absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-y-auto",
            "overscroll-contain rounded-xl border p-1.5",
            "shadow-[0_16px_48px_-12px_rgb(26_25_23/0.28)]",
            "animate-in fade-in-0 zoom-in-95 duration-150 ease-out-soft",
          )}
        >
          {matches.map((option, i) => {
            const chosen = option.toLowerCase() === value.trim().toLowerCase();
            return (
              <li key={option}>
                <button
                  type="button"
                  // pointerdown, not click: the input blurs on click and the
                  // list would be gone before the tap landed.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 text-left",
                    "text-[15px] transition-colors duration-100",
                    i === active ? "bg-accent/10 text-ink" : "text-ink",
                  )}
                  style={{ minHeight: 44 }}
                >
                  <span className="truncate">{option}</span>
                  {chosen && <Check className="size-[18px] shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && value.trim() && matches.length === 0 && emptyHint && (
        <p className="mt-1.5 text-[12.5px] text-ink-subtle">{emptyHint}</p>
      )}
    </div>
  );
}
