import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Calendar,
  Wand2,
  Users,
  Map,
  BookOpen,
  UserSquare,
  BarChart,
  Clock,
  CalendarOff,
  DollarSign,
  Coins,
  FileText,
  MessageSquare,
  Settings,
  MapPin,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const managerNavItems = [
  { href: "/manager/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/manager/schedule", icon: Calendar, label: "Schedule" },
  { href: "/manager/ai-schedule", icon: Wand2, label: "AI Schedule" },
  { href: "/manager/employees", icon: Users, label: "Employees" },
  { href: "/manager/floor", icon: Map, label: "Floor Plan" },
  { href: "/manager/reservations", icon: BookOpen, label: "Reservations" },
  { href: "/manager/guests", icon: UserSquare, label: "Guests" },
  { href: "/manager/analytics", icon: BarChart, label: "Analytics" },
  { href: "/manager/time-clock", icon: Clock, label: "Time Clock" },
  { href: "/manager/time-off", icon: CalendarOff, label: "Time Off" },
  { href: "/manager/payroll", icon: DollarSign, label: "Payroll" },
  { href: "/manager/tip-pool", icon: Coins, label: "Tip Pool" },
  { href: "/manager/documents", icon: FileText, label: "Documents" },
  { href: "/manager/chat", icon: MessageSquare, label: "Chat" },
  { href: "/manager/settings", icon: Settings, label: "Settings" },
  { href: "/manager/venues", icon: MapPin, label: "Venues" },
];

const employeeNavItems = [
  { href: "/employee/dashboard", icon: LayoutDashboard, label: "My Dashboard" },
  { href: "/employee/schedule", icon: Calendar, label: "My Schedule" },
  { href: "/employee/floor", icon: Map, label: "Floor Plan" },
  { href: "/employee/chat", icon: MessageSquare, label: "Chat" },
  { href: "/employee/time-clock", icon: Clock, label: "Time Clock" },
];

export function Layout({ children, isEmployee = false }: { children: React.ReactNode; isEmployee?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const navItems = isEmployee ? employeeNavItems : managerNavItems;

  // Close when clicking outside the drawer
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location]);

  const currentPage = navItems.find(
    (item) => location === item.href || location.startsWith(item.href + "/")
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header
        className={cn(
          "h-14 flex-shrink-0 flex items-center px-4 gap-3 border-b z-30",
          !isEmployee
            ? "bg-sidebar text-sidebar-foreground border-sidebar-border"
            : "bg-background border-border"
        )}
      >
        {/* Hamburger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "p-2 rounded-md transition-colors",
            !isEmployee
              ? "hover:bg-sidebar-accent text-sidebar-foreground"
              : "hover:bg-accent text-foreground"
          )}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 font-bold text-base select-none">
          <Building2 className="w-5 h-5" />
          VenueFlow
        </div>

        {/* Current page breadcrumb */}
        {currentPage && (
          <span
            className={cn(
              "text-sm font-medium ml-1",
              !isEmployee ? "text-sidebar-foreground/60" : "text-muted-foreground"
            )}
          >
            / {currentPage.label}
          </span>
        )}
      </header>

      {/* Overlay backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      {/* Slide-in drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col shadow-2xl transition-transform duration-200 ease-in-out",
          "w-64",
          !isEmployee
            ? "bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
            : "bg-background border-r border-border",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div
          className={cn(
            "h-14 flex items-center justify-between px-4 border-b flex-shrink-0",
            !isEmployee ? "border-sidebar-border" : "border-border"
          )}
        >
          <div className="flex items-center gap-2 font-bold text-base">
            <Building2 className="w-5 h-5" />
            VenueFlow
          </div>
          <button
            onClick={() => setOpen(false)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              !isEmployee
                ? "hover:bg-sidebar-accent text-sidebar-foreground/70"
                : "hover:bg-accent text-muted-foreground"
            )}
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? !isEmployee
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "bg-accent text-accent-foreground"
                    : !isEmployee
                    ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "p-4 border-t text-sm flex-shrink-0",
            !isEmployee ? "border-sidebar-border" : "border-border"
          )}
        >
          {isEmployee ? (
            <Link
              href="/manager/dashboard"
              className="text-muted-foreground hover:text-foreground"
            >
              Switch to Manager
            </Link>
          ) : (
            <Link
              href="/employee/dashboard"
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              Switch to Employee
            </Link>
          )}
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
