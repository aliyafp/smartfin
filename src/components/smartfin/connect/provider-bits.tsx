import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Provider, type Tone } from "@/lib/connect/providers";
import type { CapabilityStatus } from "@/lib/connect/types";

const TONE: Record<Tone, string> = {
  coral: "bg-coral/15 text-coral",
  saffron: "bg-saffron/30 text-plum",
  turquoise: "bg-turquoise/20 text-income",
  violet: "bg-violet/20 text-transfer",
  pink: "bg-pink/25 text-plum",
  plum: "bg-plum/15 text-plum",
};

export function ProviderLogo({ provider, size = "md" }: { provider: Provider; size?: "md" | "lg" }) {
  const letters = provider.name.replace(/\(.*\)/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-2xl font-extrabold tracking-tight", TONE[provider.tone], size === "lg" ? "size-16 text-xl" : "size-12 text-base")}>
      {letters}
    </span>
  );
}

const STATUS_TONE: Record<CapabilityStatus, string> = {
  available: "bg-turquoise/20 text-income",
  awaiting_setup: "bg-lavender text-transfer",
  needs_approval: "bg-saffron/30 text-plum",
  partner_required: "bg-saffron/30 text-plum",
  unsupported: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: CapabilityStatus }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", STATUS_TONE[status])}>{STATUS_LABELS[status]}</span>;
}

export const CONNECTION_STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Connected", tone: "bg-turquoise/20 text-income" },
  paused: { label: "Paused", tone: "bg-saffron/30 text-plum" },
  revoked: { label: "Disconnected", tone: "bg-muted text-muted-foreground" },
  error: { label: "Needs attention", tone: "bg-destructive/10 text-destructive" },
};

export function ConnectionBadge({ status }: { status: string }) {
  const s = CONNECTION_STATUS[status] ?? CONNECTION_STATUS["error"]!;
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", s.tone)}>{s.label}</span>;
}

export function ConnectedBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-turquoise/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-income", className)}>App</span>;
}
