import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Story 2.5 — UX-DR18 table primitives (DESIGN.md "Tables", line ~698).
 * Not a shadcn import: the spec is DiscoveryDesk-specific — h3 header cells
 * on surface-container with 24px vertical padding, 48px body rows with an
 * outline-variant bottom border, hover-overlay row highlight. Story 2.6
 * (ranking view) and 2.10 (success metrics) reuse these primitives.
 *
 * The UX-DR18 empty state ("No entries yet" + body + Primary button) is NOT
 * part of the primitives: its action button is form-specific, so the
 * consuming form owns it.
 */

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full", className)} {...props} />;
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "h-12 transition-colors hover:bg-hover-overlay motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "bg-surface-container px-4 py-6 text-left text-h3 text-on-surface",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-outline-variant px-4 py-3 align-middle",
        className,
      )}
      {...props}
    />
  );
}
