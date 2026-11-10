import Link from "next/link";

import { BookOpen, FolderOpen } from "lucide-react";

/**
 * Shared sidebar content, rendered by the static sidebar (Sidebar) and the
 * mobile drawer (MobileNav). The Discovery list plugs in below this nav in
 * Story 1.5.
 */
export function SidebarNav() {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      <Link
        href="/"
        aria-current="page"
        className="flex items-center gap-2 rounded-md border-l-2 border-accent-cyan bg-primary-container px-4 py-2 text-body font-semibold text-on-primary-container hover:bg-primary-container md:justify-center md:px-2 lg:justify-start lg:px-4"
      >
        <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">Discoveries</span>
      </Link>
      <Link
        href="/user-guide.html"
        target="_blank"
        rel="noopener"
        className="flex items-center gap-2 rounded-md px-4 py-2 text-body text-on-surface-variant hover:bg-surface-variant md:justify-center md:px-2 lg:justify-start lg:px-4"
      >
        <BookOpen className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">User guide</span>
      </Link>
    </nav>
  );
}
