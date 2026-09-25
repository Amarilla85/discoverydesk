import { redirect } from "next/navigation";
import { CreateDiscoveryForm } from "@/components/discovery/create-discovery-form";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Story 1.4 (FR1 + FR2 foundation): the Discovery List with the inline
// create form. Server Component reads (AD-9); the form is the only client
// island.
//
// NFR9 page gate: no session, no list — redirect to sign-in. The Server
// Action self-guards too (actions/discoveries.ts); this redirect is the
// visible layer. Fail closed: an ownerless Discovery is never created.
export default async function DiscoveriesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  // FR2 foundation (Story 1.5 builds the full list on this query):
  // Discoveries the user owns or collaborates on, newest-modified first —
  // which is what puts a just-created Discovery at the top (AC 2).
  const discoveries = await prisma.discovery.findMany({
    where: {
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      // Selected for Story 1.5's state badges; unused until then.
      lifecycleState: true,
    },
  });

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-display-sm text-on-surface">Discoveries</h1>
      <CreateDiscoveryForm />
      {discoveries.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {discoveries.map((discovery) => (
            <li
              key={discovery.id}
              className="rounded-lg border border-outline-variant bg-surface p-6 hover:bg-hover-overlay"
            >
              {/* Non-interactive placeholder — the workspace route arrives
                  with Story 2.1; state badges/filters/search with Story 1.5. */}
              <h2 className="text-h2 text-on-surface">{discovery.name}</h2>
              <p className="text-caption tabular-nums text-on-surface-variant">
                Created {dateFormat.format(discovery.createdAt)} · Modified{" "}
                {dateFormat.format(discovery.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
