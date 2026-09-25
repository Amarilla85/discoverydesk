import { SidebarNav } from "./sidebar-nav";
import { Wordmark } from "./wordmark";

/**
 * Static sidebar (UX-DR3): 240px at lg+, 64px icon-only at md, hidden below
 * md (the MobileNav drawer takes over). The wordmark shows in the top bar;
 * the rail keeps a narrow brand mark via the active icon.
 */
export function Sidebar() {
  return (
    <aside className="hidden w-16 shrink-0 flex-col gap-6 bg-surface-variant px-2 py-4 md:flex lg:w-60 lg:px-4">
      <div className="hidden px-2 lg:block">
        <Wordmark />
      </div>
      <SidebarNav />
    </aside>
  );
}
