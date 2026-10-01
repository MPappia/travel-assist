import Link from "next/link";
import { PlaneTakeoffIcon } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <PlaneTakeoffIcon className="size-5" />
          Traveler Assist
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
