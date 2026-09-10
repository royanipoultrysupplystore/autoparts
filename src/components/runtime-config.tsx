import { headers } from "next/headers";
import { publicConfigScript } from "@/lib/env";

/**
 * Writes the public configuration into the page at request time.
 *
 * The `headers()` call is what makes this work. Without it Next.js sees a
 * component with no request-specific input, prerenders it once during the
 * build, and bakes whatever the environment held at that moment into the
 * HTML -- which is the very problem this is here to solve. Touching a
 * request API opts the render out of the static shell, so the script is
 * regenerated for every visitor.
 *
 * The cost is that no page is statically prerendered any more. For this
 * app that is no loss: every screen shows live shared inventory, and the
 * one genuinely static page (/offline) is fetched by the service worker
 * while the phone still has signal.
 */
export async function RuntimeConfigScript() {
  await headers();

  return <script dangerouslySetInnerHTML={{ __html: publicConfigScript() }} />;
}
