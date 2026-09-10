import Link from "next/link";
import { Car, Plus, Search as SearchIcon } from "lucide-react";
import { listVehicles } from "@/lib/data/vehicles";
import { getCurrentProfile, hasFinanceAccess } from "@/lib/supabase/server";
import { AppHeader } from "@/components/nav/app-header";
import { Wordmark } from "@/components/brand";
import { EmptyState, SectionHeading } from "@/components/ui/primitives";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { TIMEZONE } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Home.
 *
 * Two things only: the search box, and what is in the yard. This is the
 * screen a partner opens standing next to a car with a customer on the
 * phone -- it is for finding something, not for reading figures. Every
 * number that used to sit here has moved to Reports, where it can be
 * labelled properly and read when there is time to think about it.
 */

/** Greeting follows the clock in the yard, not the server's. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export default async function HomePage() {
  const [profile, vehicles] = await Promise.all([
    getCurrentProfile(),
    // Cars still being worked come first; finished ones are in Vehicles.
    listVehicles({ status: ["incoming", "parting_out"] }),
  ]);

  const firstName = (profile?.full_name || "there").split(" ")[0];
  const finance = hasFinanceAccess(profile);

  return (
    <>
      <AppHeader title={<Wordmark />} />

      <div className="space-y-4 px-3 py-4">
        <p className="px-1 text-[15px] text-ink-muted">
          {greeting()}, <span className="font-medium text-ink">{firstName}</span>.
        </p>

        {/* The one thing this screen is for. */}
        <Link
          href="/search"
          className="flex h-[52px] items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3.5 text-ink-subtle shadow-[var(--shadow-card)] transition-transform duration-150 ease-out-soft active:scale-[0.99] active:bg-surface-2"
        >
          <SearchIcon className="size-5" />
          <span className="text-[16px]">Search every part in the yard</span>
        </Link>

        <section className="space-y-2.5">
          <SectionHeading
            action={
              <Link href="/vehicles" className="text-[13px] font-medium text-accent">
                All vehicles
              </Link>
            }
          >
            In the yard
          </SectionHeading>

          {vehicles.length === 0 ? (
            <EmptyState
              icon={<Car className="size-7" />}
              title="Nothing in the yard"
              body={
                finance
                  ? "Add the first car from the auction. The system builds its whole parts list for you, and you trim off what it doesn't have."
                  : "No vehicles are being parted out right now."
              }
              action={finance ? { label: "Add a vehicle", href: "/vehicles/new" } : undefined}
            />
          ) : (
            vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)
          )}
        </section>

        {finance && vehicles.length > 0 && (
          <Link
            href="/vehicles/new"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-[14.5px] font-medium text-ink-muted transition-transform duration-150 ease-out-soft active:scale-[0.99] active:bg-surface-2"
          >
            <Plus className="size-[18px]" />
            Add a vehicle
          </Link>
        )}
      </div>
    </>
  );
}
