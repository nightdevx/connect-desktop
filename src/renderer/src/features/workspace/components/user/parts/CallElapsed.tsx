import { useEffect, useState } from "react";
import { formatActivityElapsed } from "../../../workspace-utils";

// How long the call has been connected, ticking once a second.
export function CallElapsed({ since }: { since: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return <span className="ct-call-elapsed">{formatActivityElapsed(since)}</span>;
}
