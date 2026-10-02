import { useEffect, useState } from "react";
import { formatActivityElapsed } from "../../workspace-utils";

// How long something has been going -- a call, your time in a room -- ticking
// once a second.
export function ElapsedTime({
  since,
  className = "ct-elapsed",
}: {
  since: string;
  className?: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return <span className={className}>{formatActivityElapsed(since)}</span>;
}
