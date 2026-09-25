import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CreateDiscoveryForm } from "@/components/discovery/create-discovery-form";
import {
  DiscoveryList,
  type DiscoveryListItem,
} from "@/components/discovery/discovery-list";
import { DiscoveryListSkeleton } from "@/components/discovery/discovery-list-skeleton";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Story 1.5 (FR2): the full Discovery List — badges, state filter, search,
// active-row highlight, streaming skeleton, empty state — on the foundation
// Story 1.4 laid. Server Component reads (AD-9); DiscoveryList is the one
// client island.
//
// NFR9 page gate (from 1.4, unchanged): no session, no list — redirect to
// sign-in. Fail closed: an ownerless Discovery is never created.
//
// Streaming (Next 16, docs/01-app/01-getting-started/06-fetching-data.md):
// the Prisma query lives inside the async child below the <Suspense>
// boundary, so the shell renders immediately and the 5-row skeleton (AC 6)
// shows until the data resolves. The create form renders inside the boundary
// too — the empty state owns its create button (no duplicate "Create
// Discovery" buttons, AC 7 + Task 4.3), so both branches share the boundary.
export default async function DiscoveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // AC 5 mechanism: /?active=<id> highlights that row. Story 2.1 replaces
  // this with real workspace navigation; testable manually until then.
  const activeParam = params.active;
  const activeId = typeof activeParam === "string" ? activeParam : undefined;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-display-sm text-on-surface">Discoveries</h1>
      <Suspense fallback={<DiscoveryListSkeleton />}>
        <DiscoveryListSection activeId={activeId} userId={userId} />
      </Suspense>
    </section>
  );
}

// FR2 query (from 1.4, unchanged): Discoveries the user owns or collaborates
// on, newest-modified first. One indexed query, no per-row work (NFR1, AC 8).
async function DiscoveryListSection({
  activeId,
  userId,
}: {
  activeId?: string;
  userId: string;
}) {
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
      lifecycleState: true,
    },
  });

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  });

  // AC 7 empty state — EXPERIENCE.md copy exactly (UX-DR25). The
  // CreateDiscoveryForm here IS the "Create Discovery" button; the page
  // renders the form in only one place per branch.
  if (discoveries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-display-sm text-on-surface">No Discoveries yet.</p>
        <p className="text-body text-on-surface-variant">
          Create one to get started.
        </p>
        <div>
          <CreateDiscoveryForm />
        </div>
      </div>
    );
  }

  // Dates are formatted server-side; the client island receives plain strings.
  const items: DiscoveryListItem[] = discoveries.map((discovery) => ({
    id: discovery.id,
    name: discovery.name,
    createdAtLabel: dateFormat.format(discovery.createdAt),
    updatedAtLabel: dateFormat.format(discovery.updatedAt),
    lifecycleState: discovery.lifecycleState,
  }));

  return (
    <>
      <CreateDiscoveryForm />
      <DiscoveryList discoveries={items} activeId={activeId} />
    </>
  );
}
