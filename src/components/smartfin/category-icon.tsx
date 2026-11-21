import {
  Briefcase, Bus, CircleDashed, CircleEllipsis, Clapperboard, Gift, GraduationCap, HeartPulse, Home, Laptop,
  Percent, Repeat, ShoppingBag, ShoppingBasket, Sparkles, SprayCan, UtensilsCrossed, Zap, ArrowLeftRight, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategory, type CategoryTone } from "@/lib/finance/categories";

const ICONS: Record<string, LucideIcon> = {
  Briefcase, Bus, CircleDashed, CircleEllipsis, Clapperboard, Gift, GraduationCap, HeartPulse, Home, Laptop,
  Percent, Repeat, ShoppingBag, ShoppingBasket, Sparkles, SprayCan, UtensilsCrossed, Zap,
};

export const TONE_BG: Record<CategoryTone, string> = {
  coral: "bg-coral/15 text-coral",
  saffron: "bg-saffron/25 text-plum",
  turquoise: "bg-turquoise/20 text-income",
  violet: "bg-violet/20 text-transfer",
  pink: "bg-pink/25 text-plum",
  plum: "bg-plum/10 text-plum",
};
export const TONE_FILL: Record<CategoryTone, string> = {
  coral: "var(--coral)", saffron: "var(--saffron)", turquoise: "var(--turquoise)", violet: "var(--violet)", pink: "var(--pink)", plum: "var(--muted-foreground)",
};

export function CategoryIcon({ category, transfer, className }: { category: string | null; transfer?: boolean; className?: string }) {
  const c = getCategory(category);
  const Icon = transfer ? ArrowLeftRight : ICONS[c.icon] ?? CircleDashed;
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", transfer ? TONE_BG.violet : TONE_BG[c.tone], className)} aria-hidden>
      <Icon className="size-5" />
    </span>
  );
}
