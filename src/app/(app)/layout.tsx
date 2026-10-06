import type { ReactNode } from "react";

/**
 * The application surface: signup, dashboard, billing, charts — everything
 * under /app. Separate from (marketing) because it gets its own chrome and,
 * once P2-008 lands, its own auth boundary.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
