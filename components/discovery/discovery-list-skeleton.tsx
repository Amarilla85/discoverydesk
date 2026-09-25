// Story 1.5 (AC 6, UX-DR20): 5 skeleton rows matching the Discovery row
// layout, shown while the list query streams in (Suspense fallback).
// Skeleton surface per DESIGN.md: outline-variant fill, rounded-sm.
// aria-hidden — purely decorative, nothing for a screen reader to announce.
export function DiscoveryListSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, index) => (
        <li
          key={index}
          className="rounded-lg border border-outline-variant bg-surface p-6"
        >
          <div className="h-7 w-1/3 animate-pulse rounded-sm bg-outline-variant" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded-sm bg-outline-variant" />
        </li>
      ))}
    </ul>
  );
}
