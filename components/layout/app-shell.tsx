import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * Two-column application layout (UX-DR6): fixed sidebar + flexible main with
 * sticky top bar. Workspace content is centered at the 960px max content
 * width (DESIGN.md layout model).
 */
export function AppShell({
  children,
  discoveryName,
}: {
  children: React.ReactNode;
  discoveryName?: string;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar discoveryName={discoveryName} />
        <main className="mx-auto w-full max-w-[960px] flex-1 px-6 py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
