import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Sparkles, Store as StoreIcon } from "lucide-react";
import { modules, hasAccess } from "@/components/dashboard/modules";
import { ModuleIcon, LockIcon } from "@/components/dashboard/ModuleIcon";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { DashboardStats } from "@/components/dashboard/DashboardStats";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const currentStore = session.storeId
    ? await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { name: true },
      })
    : null;

  const firstName = session.name?.split(" ")[0] ?? session.name;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 animate-rise">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-primary uppercase tracking-wider">
            {greeting}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
            Select a module to get started — your retail command center is
            ready.
          </p>
        </div>
        <div className="text-sm sm:text-right shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-soft flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 shrink-0">
            <StoreIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Active Store
            </p>
            <p className="font-bold text-foreground truncate max-w-50 sm:max-w-none">
              {currentStore?.name ?? "All Stores"}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats + Quick Actions */}
      {/* <DashboardStats roleScope={session.role} /> */}

      {/* Module Grid */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 sm:mb-4">
        Modules
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
        {modules.map((mod, i) => {
          const userHasAccess = hasAccess(session.role, mod);

          if (userHasAccess) {
            return (
              <Link
                key={mod.id}
                href={mod.href}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                className="group relative flex flex-col items-center text-center p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border border-border bg-card shadow-soft hover:bg-accent/50 hover:border-primary/30 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 animate-rise"
              >
                <div className="group-hover:scale-110 transition-transform duration-200">
                  <ModuleIcon mod={mod} hasAccess={true} />
                </div>
                <h3 className="font-semibold text-foreground text-xs sm:text-sm mt-2 truncate w-full">
                  {mod.label}
                </h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {mod.description}
                </p>
              </Link>
            );
          }

          return (
            <div
              key={mod.id}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              className="group relative flex flex-col items-center text-center p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border border-border bg-card/60 opacity-70 cursor-not-allowed animate-rise"
              title={`Requires ${mod.minRole} access`}
            >
              <ModuleIcon mod={mod} hasAccess={false} />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-background/85 rounded-xl sm:rounded-2xl backdrop-blur-sm">
                <div className="flex flex-col items-center gap-1.5">
                  <LockIcon />
                  <span className="text-[11px] sm:text-xs font-medium text-muted-foreground capitalize">
                    {mod.minRole} only
                  </span>
                </div>
              </div>
              <h3 className="font-semibold text-foreground text-xs sm:text-sm mt-2 truncate w-full">
                {mod.label}
              </h3>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                {mod.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tip Banner */}
      <div className="mt-8 sm:mt-10 p-4 sm:p-5 rounded-xl bg-accent/40 border border-border text-center flex items-center justify-center gap-2.5">
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs sm:text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Tip:</span> Locked
          modules are shown so you know what features are available. Upgrade
          your role to access them.
        </p>
      </div>

      <AlertsWidget />
    </div>
  );
}
