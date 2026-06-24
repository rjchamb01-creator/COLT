"use client";

import { useEffect, useRef } from "react";
import type { Feature } from "@/lib/types";
import { trackView } from "@/lib/track";

// Fires a single feature-view event when the page mounts. Renders nothing.
// The ref guards against double-logging from React's dev StrictMode remount and
// from re-renders — one view per page load. Errors are swallowed in the action.
export function TrackView({ feature }: { feature: Feature }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void trackView(feature);
  }, [feature]);

  return null;
}
