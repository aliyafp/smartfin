import { useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MethodSpec, Provider } from "@/lib/connect/providers";
import { ProviderLogo } from "./provider-bits";

const NEVER = ["Your passwords, UPI PIN or OTPs", "Your bank balance or account numbers", "Your contacts, messages or photos", "Anything outside the file you choose"];

/** The permission screen: what SMARTFIN will see, what it never sees, and an explicit Allow. */
export function ConsentSheet({ provider, method, open, onOpenChange, onAllow, busy }: {
  provider: Provider; method: MethodSpec; open: boolean; onOpenChange: (o: boolean) => void; onAllow: () => void; busy: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setAgreed(false); onOpenChange(o); }}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-3xl">
        <SheetHeader className="items-center text-center">
          <div className="flex items-center gap-3 pt-2">
            <ProviderLogo provider={provider} />
            <span className="text-muted-foreground">⇄</span>
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-gradient text-base font-extrabold text-on-brand shadow-brand">S</span>
          </div>
          <SheetTitle className="text-xl">Allow SMARTFIN to access your {provider.name} spending?</SheetTitle>
          <SheetDescription>SMARTFIN will read the {method.label.toLowerCase()} you choose and show your spending from {provider.name} alongside everything else.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="rounded-2xl bg-turquoise/10 p-4">
            <p className="mb-2 text-sm font-bold">SMARTFIN will be able to see</p>
            <ul className="space-y-1.5 text-sm">{method.shares.map((s) => <li key={s} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-income" />{s}</li>)}</ul>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <p className="mb-2 text-sm font-bold">SMARTFIN will never see</p>
            <ul className="space-y-1.5 text-sm">{NEVER.map((s) => <li key={s} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-destructive" />{s}</li>)}</ul>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-transfer" />Nothing is added to your records until you review and confirm it.</li>
            <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-transfer" />Only you can see what's imported. You can pause, disconnect or delete it any time.</li>
            {method.processingNote && <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-transfer" />{method.processingNote}</li>}
          </ul>
          <label className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5 size-5 rounded-md" aria-label="I agree" />
            <span>I allow SMARTFIN to read my {provider.name} spending from the files I upload, for my own reports.</span>
          </label>
          <div className="flex gap-3">
            <Button variant="soft" size="lg" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>Not now</Button>
            <Button size="lg" className="flex-[2]" onClick={onAllow} disabled={!agreed || busy}>{busy && <Loader2 className="animate-spin" />}Allow</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
