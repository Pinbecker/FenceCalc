import type { ReactNode } from "react";
import { LayoutGrid, LogOut, ShieldCheck, Users } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSession } from "@/useSession";
import type { AppRoute } from "@/useHashRoute";

interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}

interface NavItem {
  route: AppRoute;
  label: string;
  icon: ReactNode;
  match?: AppRoute[];
}

export function AppShell({ currentRoute, onNavigate, children }: AppShellProps) {
  const { session, logout } = useSession();
  if (!session) return null;

  const isAdmin = session.user.role === "ADMIN";

  const items: NavItem[] = [
    {
      route: "customers",
      label: "Customers",
      icon: <Users className="h-4 w-4" />,
      match: ["customers", "customer", "project", "drawing"],
    },
  ];
  if (isAdmin) {
    items.push({
      route: "admin",
      label: "Admin",
      icon: <ShieldCheck className="h-4 w-4" />,
    });
  }

  const initials = session.user.displayName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/80 backdrop-blur md:flex">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            FE
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">
              {session.company.name}
            </div>
            <div className="truncate text-xs text-muted-foreground leading-tight">
              Fence Estimator
            </div>
          </div>
        </div>
        <Separator />
        <nav className="flex-1 space-y-0.5 p-3">
          {items.map((item) => {
            const active =
              item.route === currentRoute ||
              (item.match ?? []).includes(currentRoute);
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>
        <Separator />
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent"
              >
                <Avatar>
                  <AvatarFallback>{initials || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-tight">
                    {session.user.displayName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-tight">
                    {session.user.email}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                Signed in as {isAdmin ? "Admin" : "User"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void logout();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-card/60 px-4 backdrop-blur md:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            FE
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{session.company.name}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("customers")}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
