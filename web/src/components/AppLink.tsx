// Router links that keep the query string, so ?room=judges survives moving between pages.
// The console lives under /app; callers pass console-relative paths such as "/" or "/approvals".

import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

export const appPath = (to: string) => (to === "/" ? "/app" : `/app${to}`);

interface AppLinkProps {
  to: string;
  className?: string;
  children: ReactNode;
}

export function AppLink({ to, className, children }: AppLinkProps) {
  const { search } = useLocation();
  return (
    <Link to={{ pathname: appPath(to), search }} className={className}>
      {children}
    </Link>
  );
}

interface AppNavLinkProps {
  to: string;
  end?: boolean;
  className: (active: boolean) => string;
  children: ReactNode;
}

export function AppNavLink({ to, end, className, children }: AppNavLinkProps) {
  const { search } = useLocation();
  return (
    <NavLink to={{ pathname: appPath(to), search }} end={end} className={({ isActive }) => className(isActive)}>
      {children}
    </NavLink>
  );
}

/** navigate() that keeps the current query string. */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return (pathname: string) => navigate({ pathname: appPath(pathname), search });
}
