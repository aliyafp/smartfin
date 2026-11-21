import { cn } from "@/lib/utils";

/** SMARTFIN mark: a stacked "S" made of three colour bars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-10 place-items-center overflow-hidden rounded-2xl bg-brand-gradient shadow-brand", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none">
        <path d="M17 6.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7" stroke="var(--on-brand)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="17.5" cy="6.5" r="1.6" fill="var(--plum)" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight">
        SMART<span className="text-coral">FIN</span>
      </span>
    </span>
  );
}
