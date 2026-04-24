import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Calendar, Wand2, Users, Map, BookOpen,
  UserSquare, BarChart, Clock, CalendarOff, DollarSign, Coins,
  FileText, Library, MessageSquare, Settings, MapPin, Menu, X, CalendarCheck, Plug,
  LogOut, Bell,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { usePushNotifications } from "@/hooks/use-push-notifications";

// ── Fine dining light luxury palette ─────────────────────────────────────────
const G = {
  bg:       "#F8F3E7",  // soft ivory page
  surface:  "#FFFDF7",  // near-white cream (top bar, panels)
  surfaceHi:"#F0E8D3",  // darker cream for contrast wells
  gold:     "#B2882F",  // warm antique gold
  goldDim:  "rgba(178,136,47,0.14)",
  goldHair: "rgba(178,136,47,0.07)",
  champ:    "#2A1F17",  // deep espresso — now used for primary text
  champDim: "rgba(42,31,23,0.62)",
  muted:    "rgba(42,31,23,0.48)",
  border:   "rgba(178,136,47,0.22)",
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
  { href: "/manager/literature", icon: Library,         label: "Literature"   },
  { href: "/manager/chat",       icon: MessageSquare,   label: "Chat"         },
  { href: "/manager/integrations",icon: Plug,           label: "Integrations" },
  { href: "/manager/settings",   icon: Settings,        label: "Settings"     },
  { href: "/manager/venues",     icon: MapPin,          label: "Venues"       },
];

const employeeNavItems = [
  { href: "/employee/dashboard",   icon: LayoutDashboard, label: "My Dashboard"   },
  { href: "/employee/schedule",    icon: Calendar,        label: "My Schedule"    },
  { href: "/employee/availability",icon: CalendarCheck,   label: "My Availability"},
  { href: "/employee/floor",       icon: Map,             label: "Floor Plan"     },
  { href: "/employee/chat",        icon: MessageSquare,   label: "Chat"           },
  { href: "/employee/literature",  icon: Library,         label: "Literature"     },
  { href: "/employee/time-clock",  icon: Clock,           label: "Time Clock"     },
];

export function Layout({ children, isEmployee = false }: { children: React.ReactNode; isEmployee?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const { logout, user } = useAuth();
  const { subscribe, state: pushState } = usePushNotifications();
  const navItems = isEmployee ? employeeNavItems : managerNavItems;

  // Track current browser-level permission so the Enable button only shows
  // when there's something useful to click.
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => {
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
  });

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  const handleEnableNotifications = async () => {
    if (!user) return;
    // Must call from a user gesture on iOS Safari / installed PWA.
    await subscribe(user.id, user.venueId);
    if (typeof Notification !== "undefined") setPushPermission(Notification.permission);
  };

  const showEnableNotifications =
    !!user &&
    typeof Notification !== "undefined" &&
    "PushManager" in window &&
    pushPermission !== "granted" &&
    pushState !== "subscribed" &&
    pushState !== "unsupported";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (fabRef.current?.contains(target)) return;
      setOpen(false);
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
            className="nav-top-trigger"
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
            <div
              className="nav-dropdown"
              style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: 224,
              background: G.surface,
              border: `1px solid ${G.border}`,
              borderRadius: 20,
              boxShadow: `0 20px 48px rgba(42,31,23,0.12), 0 2px 8px rgba(42,31,23,0.06), 0 0 0 1px ${G.goldHair}, inset 0 1px 0 rgba(255,253,247,0.9)`,
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
                      onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "rgba(178,136,47,0.08)"; (e.currentTarget as HTMLElement).style.color = G.champ; } }}
                      onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = G.muted; } }}
                    >
                      <item.icon size={14} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Footer — view toggle + logout */}
              <div style={{
                borderTop: `1px solid ${G.border}`,
                padding: "10px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 11,
                letterSpacing: 1,
              }}>
                {isEmployee ? (
                  <Link href="/manager/dashboard" style={{ color: G.muted, textDecoration: "none", padding: "4px 8px" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = G.gold; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = G.muted; }}
                  >
                    ← Manager View
                  </Link>
                ) : (
                  <Link href="/employee/dashboard" style={{ color: G.muted, textDecoration: "none", padding: "4px 8px" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = G.gold; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = G.muted; }}
                  >
                    → Employee View
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Log out"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: `1px solid ${G.border}`,
                    background: "transparent",
                    color: G.champDim,
                    fontSize: 11,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(176,58,46,0.08)";
                    (e.currentTarget as HTMLElement).style.color = "#8A3D3D";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(176,58,46,0.28)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = G.champDim;
                    (e.currentTarget as HTMLElement).style.borderColor = G.border;
                  }}
                >
                  <LogOut size={12} />
                  Log out
                </button>
              </div>

              {/* Enable notifications — shown when the browser hasn't
                  granted permission yet. Must be triggered by a user
                  gesture on iOS Safari / installed PWA. */}
              {showEnableNotifications ? (
                <div style={{
                  borderTop: `1px solid ${G.border}`,
                  padding: "10px 14px",
                }}>
                  <button
                    type="button"
                    onClick={() => { void handleEnableNotifications(); }}
                    disabled={pushState === "requesting"}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${G.goldHair}`,
                      background: G.goldDim,
                      color: G.gold,
                      fontSize: 11,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      fontWeight: 700,
                      cursor: pushState === "requesting" ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <Bell size={12} />
                    {pushState === "requesting" ? "Requesting…" : pushState === "denied" || pushPermission === "denied" ? "Notifications blocked — enable in browser settings" : "Enable notifications"}
                  </button>
                </div>
              ) : null}

              {/* Build stamp — lets you confirm at a glance whether two
                  devices are running the same deploy. */}
              <div
                title={`Built ${__BUILD_TIME__}`}
                style={{
                  borderTop: `1px solid ${G.border}`,
                  padding: "8px 18px",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: G.muted,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  textAlign: "center",
                }}
              >
                Build {__BUILD_HASH__}
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
            ENISH
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
      <main className="layout-main">
        {children}
      </main>

      {/* Mobile-only floating menu button — thumb-reachable. On desktop the
          CSS (.nav-fab) hides it; the top hamburger handles navigation. */}
      <button
        ref={fabRef}
        type="button"
        className="nav-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
    </div>
  );
}
