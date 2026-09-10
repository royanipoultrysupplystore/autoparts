import { TriangleAlert } from "lucide-react";
import { Logo } from "@/components/brand";
import { describeEnvProblem, readSupabaseEnv } from "@/lib/env";

/**
 * Shown instead of a bare 500 when the Supabase environment variables did
 * not make it into the build. It names the variables that are missing,
 * and says the thing that is easy to miss: NEXT_PUBLIC_* values are baked
 * in at build time, so adding them without redeploying changes nothing.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Setup required" };

export default function SetupRequiredPage() {
  const env = readSupabaseEnv();

  const problems = env.ok
    ? []
    : [...env.missing.map((v) => ({ name: v, why: "not set" })),
       ...env.invalid.map((v) => ({ name: v, why: "not a valid URL" }))];

  return (
    <main className="mx-auto flex min-h-dvh max-w-[600px] flex-col justify-center px-5 py-10">
      <Logo size={40} />

      <div className="mt-6 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-reserved-soft text-reserved">
          <TriangleAlert className="size-5" />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold leading-tight text-ink">
            This deployment is missing its database settings
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            The app is running, but it has no Supabase project to talk to.
          </p>
        </div>
      </div>

      {env.ok ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-[14px] text-ink-muted">
          The settings look correct now. Reload the page.
        </p>
      ) : (
        <>
          <ul className="mt-6 space-y-2">
            {problems.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <code className="truncate font-mono text-[13px] text-ink">{p.name}</code>
                <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-semibold text-danger">
                  {p.why}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-accent-border bg-accent-soft p-4">
            <h2 className="text-[14.5px] font-semibold text-accent">
              Adding them is only half of it
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-accent">
              Values beginning <code className="font-mono">NEXT_PUBLIC_</code> are
              compiled into the build, not read when the page loads. If you added
              them after this deployment was built, they are not in it yet —
              you have to <strong>redeploy</strong> before they take effect.
            </p>
          </div>

          <ol className="mt-5 space-y-2.5 text-[13.5px] leading-relaxed text-ink-muted">
            <li>
              <span className="font-medium text-ink">1.</span> In your host&apos;s
              dashboard, confirm the names above are spelled exactly right — one
              wrong character reads as not set.
            </li>
            <li>
              <span className="font-medium text-ink">2.</span> Make sure each one is
              enabled for the <strong>Production</strong> environment, not only
              Preview and Development.
            </li>
            <li>
              <span className="font-medium text-ink">3.</span> Redeploy, with any
              build cache turned off.
            </li>
          </ol>

          <p className="mt-6 font-mono text-[11.5px] text-ink-subtle">
            {describeEnvProblem(env)}
          </p>
        </>
      )}
    </main>
  );
}
