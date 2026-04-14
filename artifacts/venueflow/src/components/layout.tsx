import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Calendar, Wand2, Users, Map, BookOpen,
  UserSquare, BarChart, Clock, CalendarOff, DollarSign, Coins,
  FileText, MessageSquare, Settings, MapPin, Menu, X, CalendarCheck,
} from "lucide-react";

// ── Fine dining palette ───────────────────────────────────────────────────────
const G = {
  bg:       "#0C0806",
  surface:  "#18100A",
  surfaceHi:"#1E1510",
  gold:     "#C9A84B",
  goldDim:  "rgba(201,168,75,0.18)",
  goldHair: "rgba(201,168,75,0.10)",
  champ:    "#EAD9A4",
  champDim: "rgba(234,217,164,0.48)",
  muted:    "rgba(234,217,164,0.38)",
  border:   "rgba(201,168,75,0.11)",
};

const managerNavItems = [
  { href: "/manager/dashboard",  icon: LayoutDashboard, label: "Dashboard"    },
  { href: "/manager/schedule",   icon: Calendar,        label: "Schedule"     },
  { href: "/manager/ai-schedule",icon: Wand2,           label: "AI Schedule"  },
  { href: "/manager/employees",  icon: Users,           label: "Employees"    },
  { href: "/manager/floor",      icon: Map,             label: "Floor Plan"   },
  { href: "/manager/reservations",icon: BookOpen,       label: "Reservations" },
  { href: "/manager/guests",     icon: UserSquare,      label: "Guests"       },
  { href: "/manager/analytics",  icon: BarChart,        label: "Analytics"    },
  { href: "/manager/time-clock", icon: Clock,           label: "Time Clock"   },
  { href: "/manager/time-off",   icon: CalendarOff,     label: "Time Off"     },
  { href: "/manager/payroll",    icon: DollarSign,      label: "Payroll"      },
  { href: "/manager/tip-pool",   icon: Coins,           label: "Tip Pool"     },
  { href: "/manager/documents",  icon: FileText,        label: "Documents"    },
  { href: "/manager/chat",       icon: MessageSquare,   label: "Chat"         },
  { href: "/manager/settings",   icon: Settings,        label: "Settings"     },
  { href: "/manager/venues",     icon: MapPin,          label: "Venues"       },
];

const employeeNavItems = [
  { href: "/employee/dashboard",   icon: LayoutDashboard, label: "My Dashboard"   },
  { href: "/employee/schedule",    icon: Calendar,        label: "My Schedule"    },
  { href: "/employee/availability",icon: CalendarCheck,   label: "My Availability"},
  { href: "/employee/floor",       icon: Map,             label: "Floor Plan"     },
  { href: "/employee/chat",        icon: MessageSquare,   label: "Chat"           },
  { href: "/employee/time-clock",  icon: Clock,           label: "Time Clock"     },
];

export function Layout({ children, isEmployee = false }: { children: React.ReactNode; isEmployee?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navItems = isEmployee ? employeeNavItems : managerNavItems;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => { setOpen(false); }, [location]);

  const currentPage = navItems.find((item) => location === item.href || location.startsWith(item.href + "/"));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: G.bg }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 14,
        background: G.surface,
        borderBottom: `1px solid ${G.border}`,
        position: "relative",
        zIndex: 30,
      }}>

        {/* Hamburger + dropdown anchor */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Navigation"
            style={{
              width: 36, height: 36,
              borderRadius: 10,
              border: `1px solid ${G.goldHair}`,
              background: open ? G.goldDim : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: G.gold,
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = G.goldDim; }}
            onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
          >
            {open
              ? <X size={15} />
              : <Menu size={15} />
            }
          </button>

          {/* ── Dropdown nav panel ── */}
          {open && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: 224,
              background: G.surface,
              border: `1px solid ${G.border}`,
              borderRadius: 20,
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${G.goldHair}, inset 0 1px 0 rgba(201,168,75,0.06)`,
              backdropFilter: "blur(20px)",
              overflow: "hidden",
              animation: "lux-slidein 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: 50,
            }}>

              {/* Section label */}
              <div style={{
                padding: "14px 18px 8px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: G.muted,
              }}>
                {isEmployee ? "Employee" : "Management"}
              </div>

              {/* Nav items */}
              <nav style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 1, maxHeight: "min(440px,70vh)", overflowY: "auto" }}>
                {navItems.map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                        letterSpacing: 0.3,
                        color: isActive ? G.champ : G.muted,
                        background: isActive ? G.goldDim : "transparent",
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                        borderLeft: isActive ? `2px solid ${G.gold}` : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,75,0.07)"; (e.currentTarget as HTMLElement).style.color = G.champ; } }}
                      onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = G.muted; } }}
                    >
                      <item.icon size={14} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Footer link */}
              <div style={{
                borderTop: `1px solid ${G.border}`,
                padding: "10px 18px",
                fontSize: 11,
                letterSpacing: 1,
              }}>
                {isEmployee ? (
                  <Link href="/manager/dashboard" style={{ color: G.muted, textDecoration: "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = G.gold; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = G.muted; }}
                  >
                    ← Manager View
                  </Link>
                ) : (
                  <Link href="/employee/dashboard" style={{ color: G.muted, textDecoration: "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = G.gold; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = G.muted; }}
                  >
                    → Employee View
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wordmark */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          userSelect: "none",
        }}>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: G.gold,
          }}>
            ENOSH
          </span>
          {!isEmployee && (
            <span style={{
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: G.muted,
              paddingLeft: 8,
              borderLeft: `1px solid ${G.border}`,
            }}>
              Venue Management
            </span>
          )}
        </div>

        {/* Breadcrumb */}
        {currentPage && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: G.goldDim, display: "block" }} />
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: G.muted }}>
              {currentPage.label}
            </span>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: 32 }}>
        {children}
      </main>
    </div>
  );
}
