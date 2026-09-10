import { redirect } from "next/navigation";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ProfileProvider } from "@/components/profile-provider";
import { ReservationSweeper } from "@/components/reservation-sweeper";
import { InstallPrompt, ServiceWorkerRegistrar } from "@/components/pwa/pwa";
import { NavigationProgress } from "@/components/nav/navigation-progress";
import { PageTransition } from "@/components/nav/page-transition";
import { Suspense } from "react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");

  if (!profile.is_active) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">This account is switched off</h1>
          <p className="mt-2 max-w-[34ch] text-[13.5px] text-ink-muted">
            Ask the owner to reactivate it before you sign in again.
          </p>
        </div>
      </main>
    );
  }

  const finance = hasFinanceAccess(profile);

  return (
    <ProfileProvider profile={profile}>
      {/* Bottom padding clears the fixed tab bar plus the home indicator. */}
      {/* No min-height here: <body> already fills the viewport, and
          repeating it under this padding made every page scroll 72px
          past its own content into blank space. */}
      {/* useSearchParams inside needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>

      <div className="mx-auto w-full max-w-[640px] pb-[calc(72px+env(safe-area-inset-bottom,0px))]">
        <PageTransition>{children}</PageTransition>
      </div>
      <BottomNav showReports={finance} />
      <ReservationSweeper />
      <ServiceWorkerRegistrar />
      <InstallPrompt />
    </ProfileProvider>
  );
}
