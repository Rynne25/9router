"use client";

import Link from "next/link";
import { Card } from "@/shared/components";
import Image from "next/image";

/**
 * Clickable card for MITM tools — navigates to /dashboard/mitm on click.
 */
export default function MitmLinkCard({ tool }) {
  return (
    <Link href="/dashboard/mitm" className="block group">
      <Card padding="sm" className="overflow-hidden hover:border-primary/50 transition-all cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-xl bg-white/60 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
              <Image
                src={tool.image}
                alt={tool.name}
                width={26}
                height={26}
                className="size-6 object-contain rounded-md"
                sizes="26px"
                onError={(e) => { e.target.style.display = "none"; }}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-text-main group-hover:text-primary transition-colors">{tool.name}</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-300 rounded-full">
                  Proxy MITM
                </span>
              </div>
              <p className="text-xs text-text-muted truncate">{tool.description}</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all text-[20px]">
            chevron_right
          </span>
        </div>
      </Card>
    </Link>
  );
}
