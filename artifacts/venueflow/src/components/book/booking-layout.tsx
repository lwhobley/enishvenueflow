import { Link, useLocation } from "wouter";
import { type ReactNode } from "react";
import { Calendar, LayoutGrid, User, Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";
import { useBooking } from "@/contexts/booking-context";

// Visual language for the public booking site is intentionally distinct
// from the staff app: dark "club" palette (deep ink + brand gold accent),
// generous spacing, full-bleed imagery. The staff app stays clean white
// for daytime use; this site is meant to evoke nightlife.

const navItems: { href: string; label: string; icon: typeof Calendar }[] = [
  { href: "/book",            label: "Reserve",   icon: Sparkles    },
  { href: "/book/events",     label: "Events",    icon: Calendar    },
  { href: "/book/floor-plan", label: "Floor Plan", icon: LayoutGrid },
  { href: "/book/dashboard",  label: "My Bookings", icon: User       },
];

export function BookingLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { customer } = useBooking();

  return (
    <div className="min-h-screen bg-[#0B0E1A] text-white">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0E1A]/85 backdrop-blur supports-[backdrop-filter]:bg-[#0B0E1A]/65">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <Link href="/book" className="flex items-center gap-2">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#0B0E1A] font-black text-lg"
                style={{ background: "linear-gradient(135deg, #F5C56B 0%, #C9A84B 100%)" }}
              >
                E
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm uppercase tracking-[0.18em] font-semibold">Enish</span>
                <span className="text-[10px] uppercase tracking-widest text-white/55">Late Night & Events</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || (item.href !== "/book" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              {customer ? (
                <span className="ml-2 hidden lg:inline text-xs text-white/55">
                  Hi, {customer.fullName.split(" ")[0]}
                </span>
              ) : (
                <Link
                  href="/book/login"
                  className="ml-2 inline-flex items-center rounded-md border border-white/15 px-3 py-2 text-sm text-white/85 hover:bg-white/5"
                >
                  Sign in
                </Link>
              )}
            </nav>

            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-white/85"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {mobileOpen ? (
            <div className="md:hidden border-t border-white/10 py-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-white/85 hover:bg-white/5"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              {customer ? (
                <div className="px-2 py-2 text-xs text-white/55">Hi, {customer.fullName.split(" ")[0]}</div>
              ) : (
                <Link
                  href="/book/login"
                  className="block px-2 py-2 text-sm text-[#F5C56B] hover:bg-white/5"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign in
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{children}</main>

      <footer className="mt-16 border-t border-white/10 bg-[#070914] py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center text-xs text-white/50">
          <div className="font-semibold uppercase tracking-[0.2em] text-white/70">ENISH</div>
          <div className="mt-1">5851 Westheimer Rd, Houston, TX 77057</div>
          <div className="mt-3">
            Powered by <span className="text-[#F5C56B]">VenueFlow</span> — bookings sync live to the floor.
          </div>
        </div>
      </footer>
    </div>
  );
}
