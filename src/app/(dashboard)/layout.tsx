// src\app\(dashboard)\layout.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login");
  }

  // Verify the user still exists & is active in the database.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true, role: true },
  });
  if (!user || !user.isActive) {
    redirect("/login");
  }

  const storesData = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  const stores = storesData.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
  }));

  const currentStore = session.storeId
    ? (stores.find((s) => s.id === session.storeId) ?? null)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar session={session} stores={stores} currentStore={currentStore} />
      <main
        id="main-content"
        className="flex-1 w-full px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-6 md:pt-8 pb-8 sm:pb-12"
      >
        {children}
      </main>
      <footer className="mt-auto border-t border-border bg-card/40 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground/80">ZKS</span>{" "}
            Store Management — Pakistani retail &amp; khata
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            System operational
          </p>
        </div>
      </footer>
      <Toaster
        position="top-right"
        richColors
        toastOptions={{
          className: "text-sm sm:text-base",
        }}
      />
    </div>
  );
}
