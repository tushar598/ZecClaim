"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  Menu,
  PlusSquare,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ChainStatus } from "./ChainStatus";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}

/** Campaign being viewed on /admin/[id], /proof/[id] or /ack/[id] (null elsewhere). */
function campaignFromPath(path: string): string | null {
  const m = path.match(/^\/(?:admin|proof|ack)\/([^/?#]+)/);
  return m && m[1] !== "new" ? decodeURIComponent(m[1]) : null;
}

const TOP_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#check", label: "Check an address" },
  { href: "/#trust", label: "Trust model" },
];

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={item.active ? "page" : undefined}
      className={clsx(
        "w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-[10px] text-[13.5px] transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        item.active ? "neo-card-sm text-mint-hover font-semibold" : "text-subtle hover:text-ink-soft font-medium hover:bg-ink/[0.04]"
      )}
    >
      <span
        className={clsx(
          "w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 transition-colors",
          item.active ? "bg-mint/12 text-mint" : "neo-inset-sm text-faint"
        )}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div className="space-y-1.5">
      <p className="px-3.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">{title}</p>
      {items.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const campaignId = campaignFromPath(pathname);
  const sandbox = isSandboxEnabled();
  const close = () => setMobileOpen(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const workspace: NavItem[] = [
    { href: "/", label: "Overview", icon: LayoutDashboard, active: pathname === "/" },
    { href: "/admin/new", label: "New campaign", icon: PlusSquare, active: pathname === "/admin/new" },
    { href: "/campaigns", label: "My campaigns", icon: FolderOpen, active: pathname === "/campaigns" },
    ...(sandbox
      ? [{ href: "/sandbox", label: "Judge sandbox", icon: FlaskConical, active: pathname === "/sandbox" || campaignId === DEMO_CAMPAIGN_ID }]
      : []),
  ];

  const current: NavItem[] = campaignId
    ? [
        { href: `/admin/${campaignId}`, label: "Organizer console", icon: SlidersHorizontal, active: pathname.startsWith("/admin/") },
        { href: `/proof/${campaignId}`, label: "Proof portal", icon: ShieldCheck, active: pathname.startsWith("/proof/") },
        { href: `/ack/${campaignId}`, label: "Gift card receipts", icon: BadgeCheck, active: pathname.startsWith("/ack/") },
      ]
    : [];

  // Recipients opening a claim link get a focused page, not the organizer workspace.
  const focused = pathname.startsWith("/claim/");

  return (
    <div className="min-h-screen bg-canvas text-ink overflow-x-clip print:bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 neo-card-sm rounded-lg px-3 py-2 text-[13px] font-semibold text-ink"
      >
        Skip to content
      </a>
      <div className="w-full max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-7 pb-8 print:p-0">
        <div className="neo-shell rounded-[18px] sm:rounded-[22px] flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] print:shadow-none print:bg-white">
          {!focused && (
            <aside
              aria-label="ZecClaim navigation"
              className="hidden lg:flex lg:w-[248px] shrink-0 flex-col justify-between bg-rail border-r border-line rounded-l-[22px] py-7 px-4 print:hidden"
            >
              <div className="space-y-7">
                <Link href="/" className="px-3.5 inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-md">
                  <Logo />
                </Link>
                <nav aria-label="Workspace" className="space-y-6">
                  <NavGroup title="Workspace" items={workspace} />
                  {current.length > 0 && (
                    <NavGroup title={campaignId === DEMO_CAMPAIGN_ID ? "Sandbox campaign" : "This campaign"} items={current} />
                  )}
                </nav>
              </div>

              <div className="px-3.5 pt-8 space-y-4">
                <div className="space-y-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Chain (live)</p>
                  <ChainStatus />
                </div>
                <p className="text-[11px] leading-relaxed text-subtle">
                  Non-custodial: ZecClaim never sees spending keys and never broadcasts transactions.
                </p>
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0 flex flex-col px-4 sm:px-8 lg:px-10 py-5 sm:py-7 print:p-0">
            <header className="flex items-center justify-between gap-4 pb-5 border-b border-line print:hidden">
              <div className={clsx("flex items-center gap-3", !focused && "lg:hidden")}>
                {!focused && (
                  <button
                    type="button"
                    onClick={() => setMobileOpen((o) => !o)}
                    aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
                    aria-expanded={mobileOpen}
                    className="neo-icon-btn w-10 h-10 rounded-xl flex items-center justify-center text-ink"
                  >
                    {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                  </button>
                )}
                <Link href="/" aria-label="ZecClaim home">
                  <Logo size="sm" />
                </Link>
              </div>

              {!focused && (
                <nav aria-label="Primary" className="hidden md:flex items-center gap-7">
                  {TOP_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-[13px] font-medium text-ink-soft hover:text-mint-hover transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              )}

              <div className="flex items-center gap-3 shrink-0">
                <ThemeToggle />
                {!focused && (
                  <Link
                    href="/admin/new"
                    className="hidden sm:inline-flex neo-btn-mint h-9 px-4 rounded-[10px] text-[12.5px] font-semibold items-center"
                  >
                    New campaign
                  </Link>
                )}
              </div>
            </header>

            {mobileOpen && !focused && (
              <div className="lg:hidden py-4 border-b border-line space-y-5">
                <NavGroup title="Workspace" items={workspace} onNavigate={close} />
                {current.length > 0 && <NavGroup title="This campaign" items={current} onNavigate={close} />}
                <div className="px-3.5 space-y-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">Chain (live)</p>
                  <ChainStatus className="max-w-xs" />
                </div>
              </div>
            )}

            <main id="main" className="flex-1 pt-6 print:pt-0">
              {children}
            </main>
          </div>
        </div>

        <footer className="mt-6 px-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-subtle print:hidden">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>Open source, MIT License</span>
          </div>
          <span className="font-mono">NU7 · ZIP 316 · 321 · 324 · 2009</span>
        </footer>
      </div>
    </div>
  );
}
