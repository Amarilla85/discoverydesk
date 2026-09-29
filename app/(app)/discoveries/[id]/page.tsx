import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildStateMap, defaultPhaseNumber } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

// Story 2.1: the Discovery workspace entry route. The workspace itself lives
// at /discoveries/[id]/phases/[phase] — this page resolves which phase to
// open (the first not-yet-Approved phase, i.e. the working phase) and
// redirects there, so /discoveries/<id> is always a valid deep link.
//
// NFR9 page gate (same as the Discovery List): no session → sign-in redirect;
// the owner-or-collaborator filter below is the real access check — a
// Discovery the user can't see is indistinguishable from one that doesn't
// exist (notFound, never a 403 that leaks existence).
export default async function DiscoveryWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  const discovery = await prisma.discovery.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    select: { phases: { select: { phaseType: true, state: true } } },
  });
  if (!discovery) notFound();

  const phaseNumber = defaultPhaseNumber(buildStateMap(discovery.phases));
  redirect(`/discoveries/${id}/phases/${phaseNumber}`);
}
