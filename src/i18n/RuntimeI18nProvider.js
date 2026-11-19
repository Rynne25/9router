"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initRuntimeI18n, translateRouteChange } from "./runtime";

export function RuntimeI18nProvider({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    initRuntimeI18n();
  }, []);

  // Re-process newly mounted route content when route changes
  useEffect(() => {
    if (pathname) {
      // Double RAF to ensure React has committed changes to DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          translateRouteChange();
        });
      });
    }
  }, [pathname]);

  return <>{children}</>;
}
