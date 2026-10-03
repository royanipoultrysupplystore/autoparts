import { getFilterOptions, getSearchVehicles } from "@/lib/data/search";
import { SearchScreen } from "./search-screen";

export const dynamic = "force-dynamic";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; v?: string }>;
}) {
  const [params, options, vehicles] = await Promise.all([
    searchParams,
    getFilterOptions(),
    getSearchVehicles(),
  ]);

  return (
    <SearchScreen
      options={{
        makes: options.makes,
        models: options.models,
        categories: options.categories,
      }}
      initialQuery={params.q ?? ""}
      vehicles={vehicles}
      initialVehicleId={params.v ?? null}
    />
  );
}
