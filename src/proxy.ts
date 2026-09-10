import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readSupabaseEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session on every request and keeps signed-out
 * visitors out of the app. The database enforces the real rules; this
 * just avoids rendering pages that could only show errors.
 */

// `/offline` must be public: the service worker precaches it at install
// time, and a redirect to /login would be cached in its place -- leaving
// an offline partner staring at a sign-in form they cannot submit.
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/shop",
  "/offline",
  "/setup-required",
  "/manifest.webmanifest",
  "/icons",
  "/sw.js",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  /*
   * This runs before every page, so anything thrown here becomes a bare
   * "Internal Server Error" on every route in the app -- including the
   * static ones that need no database at all.
   *
   * Supabase's client throws when handed an undefined URL, which is
   * exactly what a build that never received its NEXT_PUBLIC_* values
   * hands it. Check first and send the visitor somewhere that explains
   * the problem, rather than crashing the whole site over a config
   * value.
   */
  const env = readSupabaseEnv();

  if (!env.ok) {
    if (request.nextUrl.pathname === "/setup-required") return response;

    const url = request.nextUrl.clone();
    url.pathname = "/setup-required";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: this call is what refreshes an expiring token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Images are
     * excluded so the service worker can serve them offline without a
     * round trip through auth.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
