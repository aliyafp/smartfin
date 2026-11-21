import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { BarChart3, Home, ListOrdered, PiggyBank, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AppLayout,
});

const TABS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background bg-soft-glow bg-no-repeat">
      <main className="px-5 pb-32">
        <Outlet />
      </main>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border/70 bg-card/95 pb-safe shadow-nav backdrop-blur">
        <ul className="grid grid-cols-5">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <li key={to}>
                <Link to={to} className={cn("flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-[11px] font-semibold transition-colors", active ? "text-coral" : "text-muted-foreground hover:text-foreground")} aria-current={active ? "page" : undefined}>
                  <span className={cn("grid h-8 w-12 place-items-center rounded-full transition-colors", active && "bg-coral/12")}>
                    <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
