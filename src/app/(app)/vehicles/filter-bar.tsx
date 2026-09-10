"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "parting_out", label: "Parting out" },
  { value: "incoming", label: "Incoming" },
  { value: "depleted", label: "Depleted" },
  { value: "scrapped", label: "Scrapped" },
] as const;

/** Horizontally scrolling chips. Defaults to everything, filters on tap. */
export function VehicleFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const active = params.get("status");

  function select(value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("status", value);
    else next.delete("status");
    startTransition(() => router.replace(`/vehicles?${next.toString()}`, { scroll: false }));
  }

  return (
    <div
      className={cn(
        "no-scrollbar flex gap-2 overflow-x-auto border-t border-line px-3 py-2.5",
        pending && "opacity-70",
      )}
    >
      <Chip label="All" selected={!active} onClick={() => select(null)} />
      {FILTERS.map((f) => (
        <Chip
          key={f.value}
          label={f.label}
          selected={active === f.value}
          onClick={() => select(f.value)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
        selected
          ? "border-accent bg-accent text-accent-text"
          : "border-line-strong bg-surface text-ink-muted active:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}
