"use client";

import { useEffect, useState } from "react";

export function AgentationToolbar() {
  const [LoadedComponent, setLoadedComponent] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const isEnabled =
      process.env.NODE_ENV === "development" ||
      window.localStorage.getItem("enable-agentation") === "1";

    if (!isLocalHost || !isEnabled) return;

    let active = true;
    import("agentation")
      .then((mod) => {
        if (active && mod?.Agentation) {
          setLoadedComponent(() => mod.Agentation);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (!LoadedComponent) {
    return null;
  }

  return <LoadedComponent endpoint="http://localhost:4747" />;
}
