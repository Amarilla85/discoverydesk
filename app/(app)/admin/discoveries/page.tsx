import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DiscoveryStateBadge } from "@/components/discovery/discovery-state-badge";
import { isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/*
 * Testing-phase admin overview — the list half (Mar's decision, 2026-10-08,
 * see lib/admin.ts). The NFR9 owner-or-collaborator filter keeps guest work
 * out of everyone's Discovery List; THIS page deliberately drops that filter
 * and lists every Discovery so the app owner can see what testers create.
 *
 * Gate: session email must match OWNER_EMAIL. Fail closed and quiet — a
 * non-owner gets notFound (the NFR9 convention: never a 403 that leaks
 * existence, applied here to the page itself), guests (NULL email) never
 * match.
 *
 * Strictly read-only: rows link to the read-only detail view
 * (/admin/discoveries/[id]), never to a workspace. No mutations are offered
 * anywhere in the admin routes.
 */
export default async function AdminDiscoveriesPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");
  if (!isAdminEmail(session.user?.email)) notFound();

  const discoveries = await prisma.discovery.findMany({
    // No owner-or-collaborator filter — the whole point of this page.
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lifecycleState: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
    },
  });

  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

  return (
    <AppShell>
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-display-sm text-on-surface">All discoveries</h1>
          <p className="text-body text-on-surface-variant">
            Read-only overview for the app owner — every Discovery in the
            workspace, including ones guests created.{" "}
            {discoveries.length === 1
              ? "1 Discovery."
              : `${discoveries.length} Discoveries.`}
          </p>
        </header>

        {discoveries.length === 0 ? (
          <p className="text-body text-on-surface-variant">
            No Discoveries exist yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {discoveries.map((discovery) => (
              <li
                key={discovery.id}
                className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-4"
              >
                <Link
                  href={`/admin/discoveries/${discovery.id}`}
                  className="block min-w-0 flex-1"
                >
                  <h2 className="text-h1 text-on-surface [overflow-wrap:anywhere]">
                    {discovery.name}
                  </h2>
                  {/* Guests have a NULL email and a Guest-xxxxxxxx name
                      (actions/guest.ts) — the name alone identifies them. */}
                  <p className="text-caption tabular-nums text-on-surface-variant">
                    Owner:{" "}
                    {discovery.owner.email ?? discovery.owner.name} · Created{" "}
                    {dateFormat.format(discovery.createdAt)}
                  </p>
                </Link>
                <DiscoveryStateBadge state={discovery.lifecycleState} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
