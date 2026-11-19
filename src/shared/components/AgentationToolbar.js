"use client";

import { Agentation } from "agentation";
import { useEffect, useState } from "react";

export function AgentationToolbar() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Allow toolbar on localhost / dev
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      process.env.NODE_ENV === "development");

  if (!isLocal) {
    return null;
  }

  return <Agentation endpoint="http://localhost:4747" />;
}
