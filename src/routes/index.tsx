import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, PieChart, ScanLine, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/smartfin/logo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMARTFIN — Your money, in full colour" },
      { name: "description", content: "An India-first personal finance app: record income, expenses, refunds and transfers in ₹ and see where your money goes." },
      { property: "og:title", content: "SMARTFIN — Your money, in full colour" },
      { property: "og:description", content: "Organise your recorded finances in one colourful, trustworthy place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const SLIDES = [
  { icon: Wallet, tone: "bg-coral/15 text-coral", title: "Your finances, organised", body: "Register your bank, UPI apps, cards and cash, then keep every recorded transaction in one place. SMARTFIN never asks for bank passwords, UPI PINs or OTPs." },
  { icon: PieChart, tone: "bg-turquoise/20 text-income", title: "Understand your spending", body: "Every entry is categorised. Income, expenses, refunds and transfers are counted correctly, so your totals stay honest." },
  { icon: ScanLine, tone: "bg-violet/20 text-transfer", title: "Import and compare", body: "Import CSV statements from your bank or UPI app, then compare this month with last month. Receipt scanning and budgets are on the roadmap — we'll only switch them on once they actually work." },
];

function Welcome() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<"splash" | "onboarding">("splash");
  const [i, setI] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) navigate({ to: "/home", replace: true });
      else setStage("onboarding");
    }, 900);
    return () => { cancelled = true; clearTimeout(t); };
  }, [navigate]);

  if (stage === "splash") {
    return (
      <div className="grid min-h-dvh place-items-center bg-brand-gradient">
        <div className="flex flex-col items-center text-on-brand animate-rise">
          <LogoMark className="size-20 rounded-3xl bg-card/20 shadow-none" />
          <p className="mt-5 text-3xl font-extrabold tracking-tight">SMARTFIN</p>
          <p className="mt-1 text-sm font-medium opacity-90">Your money, in full colour.</p>
          <div className="mt-8 flex gap-1.5" aria-label="Loading">
            {[0, 1, 2].map((d) => (
              <span key={d} className="size-2 rounded-full bg-on-brand animate-pulse-dot" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const slide = SLIDES[i] ?? SLIDES[0]!;
  const Icon = slide.icon;
  const last = i === SLIDES.length - 1;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-soft-glow bg-no-repeat px-6 pt-safe pb-safe">
      <div className="flex items-center justify-between pt-6">
        <Wordmark />
        <Link to="/auth" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Skip</Link>
      </div>

      <div key={i} className="flex flex-1 flex-col justify-center animate-rise">
        <div className="relative mx-auto mb-10 grid size-56 place-items-center">
          <div className="absolute inset-0 rounded-[3rem] bg-brand-gradient opacity-15 rotate-6" />
          <div className="absolute inset-4 rounded-[2.5rem] bg-lavender -rotate-3" />
          <div className={cn("relative grid size-28 place-items-center rounded-[2rem] bg-card shadow-card", slide.tone)}>
            <Icon className="size-12" />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{slide.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{slide.body}</p>
      </div>

      <div className="pb-8">
        <div className="mb-6 flex gap-2" role="tablist" aria-label="Onboarding progress">
          {SLIDES.map((_, d) => (
            <button key={d} aria-label={`Slide ${d + 1}`} onClick={() => setI(d)} className={cn("h-2 rounded-full transition-all", d === i ? "w-8 bg-coral" : "w-2 bg-border")} />
          ))}
        </div>
        {last ? (
          <Button variant="hero" size="lg" className="w-full" onClick={() => navigate({ to: "/auth" })}>Get started <ArrowRight /></Button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setI(i + 1)}>Next <ArrowRight /></Button>
        )}
      </div>
    </div>
  );
}
