import { getFilterOptions } from "@/lib/data/search";
import { SearchScreen } from "./search-screen";

export const dynamic = "force-dynamic";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [params, options] = await Promise.all([searchParams, getFilterOptions()]);

  return (
    <SearchScreen
      options={{
        makes: options.makes,
        models: options.models,
        categories: options.categories,
      }}
      initialQuery={params.q ?? ""}
    />
  );
}
