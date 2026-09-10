import { ReportsSkeleton } from "@/components/ui/skeletons";

/**
 * Shown the moment this route is navigated to, while the server fetches.
 * Without it the previous screen just sits there and the tap reads as
 * having done nothing.
 */
export default function Loading() {
  return <ReportsSkeleton />;
}
