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
  Building2
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

export function Layout({ children, isEmployee = false }: { children: React.ReactNode, isEmployee?: boolean }) {
  const [location] = useLocation();
  const navItems = isEmployee ? employeeNavItems : managerNavItems;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "w-64 flex-shrink-0 flex flex-col border-r border-border",
        !isEmployee && "bg-sidebar text-sidebar-foreground border-sidebar-border"
      )}>
        <div className={cn(
          "h-16 flex items-center px-6 font-bold text-lg border-b",
          !isEmployee ? "border-sidebar-border" : "border-border"
        )}>
          <Building2 className="w-5 h-5 mr-2" />
          VenueFlow
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive 
                    ? (!isEmployee ? "bg-sidebar-accent text-sidebar-accent-foreground" : "bg-accent text-accent-foreground")
                    : (!isEmployee ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                )}>
                  <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className={cn(
          "p-4 border-t flex items-center justify-between text-sm",
          !isEmployee ? "border-sidebar-border" : "border-border"
        )}>
          {isEmployee ? (
            <Link href="/manager/dashboard" className="text-muted-foreground hover:text-foreground">Switch to Manager</Link>
          ) : (
            <Link href="/employee/dashboard" className="text-sidebar-foreground/70 hover:text-sidebar-foreground">Switch to Employee</Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
