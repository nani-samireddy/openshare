import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type ControlSectionProps = {
  title: string;
  icon: ReactNode;
  summary?: string;
  badge?: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function ControlSection({ title, icon, summary, badge, defaultOpen = false, children }: ControlSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-md border-2 border-ink bg-cream">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center gap-3 px-3 text-left transition hover:bg-white"
      >
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-ink ${open ? "bg-sun" : "bg-white"}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-extrabold uppercase tracking-wider text-ink">{title}</span>
          {summary ? <span className="block truncate text-xs font-bold text-ink/60">{summary}</span> : null}
        </span>
        {badge ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full border-2 border-ink bg-coral px-1 text-xs font-extrabold text-ink">
            {badge}
          </span>
        ) : null}
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t-2 border-ink p-3">{children}</div> : null}
    </section>
  );
}
