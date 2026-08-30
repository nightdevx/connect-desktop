import { useCallback, useEffect, useRef, useState } from "react";
import type { RulesGunline } from "../../../difficulty";
import {
  PLAYER_BOUND,
  chooseUpgrade,
  createRun,
  starsFor,
  startRun,
  stepRun,
  summarise,
  triggerAbility,
  type AbilityId,
  type GunlineLevel,
  type GunlineMode,
  type GunlineState,
  type Loadout,
  type MetaBonus,
  type RunPhase,
  type RunSummary,
} from "../../../gunline";
import { useMinigameCue } from "../../../use-minigame-cue";
import { bannerFor, snapshot, type GunlineHud } from "./hud-model";
import { RunHud } from "./run-hud";
import { UpgradeOffer } from "./upgrade-offer";
import type { GunlineScene } from "../../../gunline-3d/scene";

const STEP = 1 / 60;
const MAX_FRAME = 0.05;
const HUD_INTERVAL = 0.1;
const KEY_SPEED = 5.4;

export interface GunlineBoardProps {
  mode: GunlineMode;
  level: GunlineLevel | null;
  rules: RulesGunline;
  loadout: Loadout;
  bonus: MetaBonus;
  seed: number;
  onFinish: (summary: RunSummary) => void;
  onExit: () => void;
  overlay?: React.ReactNode;
}

export function GunlineBoard({
  mode,
  level,
  rules,
  loadout,
  bonus,
  seed,
  onFinish,
  onExit,
  overlay,
}: GunlineBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<GunlineScene | null>(null);
  const [state] = useState<GunlineState>(() =>
    createRun({ mode, rules, level, loadout, bonus, seed }),
  );
  const stateRef = useRef(state);
  const targetRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const frameRef = useRef(0);
  const finishedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gatesOnScreen, setGatesOnScreen] = useState(false);
  const [hud, setHud] = useState<GunlineHud>(() => snapshot(state));

  useMinigameCue("blast", hud.wave);
  useMinigameCue("splash", hud.leaks);
  useMinigameCue("gateDing", hud.goodGates);
  useMinigameCue("alarm", hud.jammed ? 1 : 0);
  useMinigameCue("rifleCrack", hud.weapon);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;

    void import("../../../gunline-3d/scene")
      .then(({ createGunlineScene }) => createGunlineScene(canvas))
      .then((scene) => {
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let last = performance.now();
    let carry = 0;
    let hudTimer = 0;
    let hudPhase: RunPhase = stateRef.current.phase;

    const tick = (now: number): void => {
      frameRef.current = requestAnimationFrame(tick);

      const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
      last = now;

      const run = stateRef.current;
      const keys = keysRef.current;
      if (keys.left || keys.right) {
        const direction = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        targetRef.current = Math.max(
          -PLAYER_BOUND,
          Math.min(PLAYER_BOUND, targetRef.current + direction * KEY_SPEED * elapsed),
        );
      }

      carry = Math.min(carry + elapsed, 0.25);
      while (carry >= STEP) {
        stepRun(run, STEP, targetRef.current);
        carry -= STEP;
      }

      sceneRef.current?.render(run, elapsed);

      hudTimer += elapsed;
      if (hudTimer >= HUD_INTERVAL || run.phase !== hudPhase) {
        hudTimer = 0;
        hudPhase = run.phase;
        setHud(snapshot(run));
        setGatesOnScreen(run.gates.length > 0);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [ready]);

  useEffect(() => {
    if (hud.phase !== "won" && hud.phase !== "over") {
      return;
    }
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;

    const run = stateRef.current;
    const won = run.phase === "won";
    onFinish(summarise(run, won, starsFor(run, won)));
  }, [hud.phase, onFinish]);

  const trigger = useCallback((id: AbilityId) => {
    triggerAbility(stateRef.current, id, targetRef.current);
    setHud(snapshot(stateRef.current));
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        keysRef.current.left = true;
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        keysRef.current.right = true;
      }
      const slot = Number.parseInt(event.key, 10);
      if (Number.isFinite(slot) && slot >= 1 && slot <= 4) {
        const ability = stateRef.current.abilities[slot - 1];
        if (ability) {
          trigger(ability.id);
        }
      }
    };
    const up = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        keysRef.current.left = false;
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        keysRef.current.right = false;
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [trigger]);

  const aim = useCallback((clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const ratio = (clientX - bounds.left) / Math.max(1, bounds.width);
    targetRef.current = (ratio * 2 - 1) * PLAYER_BOUND;
  }, []);

  const begin = useCallback(() => {
    startRun(stateRef.current);
    setHud(snapshot(stateRef.current));
  }, []);

  const take = useCallback((id: string) => {
    chooseUpgrade(stateRef.current, id);
    setHud(snapshot(stateRef.current));
  }, []);

  const banner = bannerFor(hud, gatesOnScreen);

  return (
    <div className="ct-gl-run" data-state={hud.phase === "over" ? "lost" : "live"}>
      <canvas
        ref={canvasRef}
        className="ct-gl-canvas"
        aria-label="Cephe hattı sahnesi"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          aim(event.clientX, event.currentTarget);
          begin();
        }}
        onPointerMove={(event) => aim(event.clientX, event.currentTarget)}
      />

      <RunHud hud={hud} level={level} banner={banner} onAbility={trigger} onExit={onExit} />

      {failed ? (
        <div className="ct-gl-veil">
          <span className="ct-gl-veil-title">Sahne yüklenemedi</span>
        </div>
      ) : null}

      {!failed && !ready ? (
        <div className="ct-gl-veil">
          <span className="ct-gl-veil-title">Yükleniyor</span>
          <span className="ct-gl-veil-note">Modeller hazırlanıyor</span>
        </div>
      ) : null}

      {ready && hud.phase === "ready" ? (
        <button type="button" className="ct-gl-veil" data-tap="yes" onClick={begin}>
          <span className="ct-gl-veil-title">DOKUN VE BAŞLA</span>
          <span className="ct-gl-veil-note">
            Parmağını sürükle — ateş kendiliğinden. 1-4 destek çağırır.
          </span>
        </button>
      ) : null}

      {overlay ?? (hud.phase === "upgrade" ? (
        <UpgradeOffer wave={hud.wave} offer={hud.offer} onPick={take} />
      ) : null)}
    </div>
  );
}
