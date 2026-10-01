import Link from "next/link";
import { BookmarkPlusIcon, PlaneTakeoffIcon } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <PlaneTakeoffIcon className="size-5" />
          Traveler Assist
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/import/setup"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
          >
            <BookmarkPlusIcon className="size-4" />
            <span className="hidden sm:inline">Importer une annonce</span>
            <span className="sr-only sm:hidden">Importer une annonce</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
