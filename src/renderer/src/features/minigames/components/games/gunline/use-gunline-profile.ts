import { useCallback, useMemo, useState } from "react";
import {
  readGunlineProfileRaw,
  writeGunlineProfileRaw,
} from "@/store/gunline-progress";
import {
  currentMissions,
  normaliseProfile,
  refreshMissions,
  resetProfile,
  todayKey,
  type GunlineProfile,
  type Mission,
} from "../../../gunline";

export interface GunlineProfileHandle {
  profile: GunlineProfile;
  dayKey: string;
  missions: Mission[];
  update: (next: GunlineProfile) => void;
  reset: () => void;
}

export function useGunlineProfile(): GunlineProfileHandle {
  const dayKey = useMemo(() => todayKey(new Date()), []);

  const [profile, setProfile] = useState<GunlineProfile>(() =>
    refreshMissions(normaliseProfile(readGunlineProfileRaw()), dayKey),
  );

  const update = useCallback((next: GunlineProfile) => {
    setProfile(next);
    writeGunlineProfileRaw(next);
  }, []);

  const reset = useCallback(() => {
    const fresh = resetProfile();
    setProfile(fresh);
    writeGunlineProfileRaw(fresh);
  }, []);

  const missions = useMemo(() => currentMissions(profile, dayKey), [profile, dayKey]);

  return { profile, dayKey, missions, update, reset };
}
