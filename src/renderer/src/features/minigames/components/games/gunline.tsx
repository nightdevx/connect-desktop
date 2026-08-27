import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { scoreKey } from "@/store/minigame-scores";
import { RULES_GUNLINE } from "../../difficulty";
import {
  PLAYER_BOUND,
  chooseUpgrade,
  createGunline,
  startGunline,
  stepGunline,
  type GunlinePhase,
  type GunlineState,
  type GunlineUpgrade,
} from "../../gunline-logic";
import { useRecordRun } from "../../use-record-run";
import { GameOutcome } from "../game-outcome";
import { GameShell } from "../game-shell";
import type { MinigameBoardProps } from "../../board-props";
import type { GunlineScene } from "../../gunline-3d/scene";

const STEP = 1 / 60;
const MAX_FRAME = 0.05;
const HUD_INTERVAL = 0.12;
const KEY_SPEED = 5.4;

interface Hud {
  phase: GunlinePhase;
  wave: number;
  units: number;
  score: number;
  kills: number;
  weapon: string;
  offer: GunlineUpgrade[];
}

function snapshot(state: GunlineState): Hud {
  return {
    phase: state.phase,
    wave: state.wave,
    units: state.units,
    score: state.score,
    kills: state.kills,
    weapon: state.weapon.label,
    offer: state.offer,
  };
}

export function Gunline({ difficulty }: MinigameBoardProps) {
  const rules = RULES_GUNLINE[difficulty];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<GunlineScene | null>(null);
  const [initialState] = useState(() => createGunline(rules, (Math.random() * 0xffffffff) >>> 0));
  const stateRef = useRef<GunlineState>(initialState);
  const targetRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const frameRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(stateRef.current));

  const isOver = hud.phase === "over";
  const isRecord = useRecordRun(scoreKey("gunline", difficulty), isOver, hud.score);

  useEffect(() => {
    stateRef.current = createGunline(rules, (Math.random() * 0xffffffff) >>> 0);
    targetRef.current = 0;
    setHud(snapshot(stateRef.current));
  }, [rules]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;

    void import("../../gunline-3d/scene")
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
    let hudPhase: GunlinePhase = stateRef.current.phase;

    const tick = (now: number): void => {
      frameRef.current = requestAnimationFrame(tick);

      const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
      last = now;

      const state = stateRef.current;
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
        stepGunline(state, STEP, targetRef.current);
        carry -= STEP;
      }

      sceneRef.current?.render(state, elapsed);

      hudTimer += elapsed;
      if (hudTimer >= HUD_INTERVAL || state.phase !== hudPhase) {
        hudTimer = 0;
        hudPhase = state.phase;
        setHud(snapshot(state));
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [ready]);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        keysRef.current.left = true;
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        keysRef.current.right = true;
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
  }, []);

  const aim = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    targetRef.current = (ratio * 2 - 1) * PLAYER_BOUND;
  }, []);

  const begin = useCallback(() => {
    startGunline(stateRef.current);
    setHud(snapshot(stateRef.current));
  }, []);

  const restart = useCallback(() => {
    stateRef.current = createGunline(rules, (Math.random() * 0xffffffff) >>> 0);
    targetRef.current = 0;
    startGunline(stateRef.current);
    setHud(snapshot(stateRef.current));
  }, [rules]);

  const take = useCallback((id: string) => {
    chooseUpgrade(stateRef.current, id);
    setHud(snapshot(stateRef.current));
  }, []);

  const status = useMemo(() => {
    if (failed) {
      return { text: "Sahne yüklenemedi.", tone: "done" as const };
    }
    if (!ready) {
      return { text: "Modeller yükleniyor...", tone: "wait" as const };
    }
    if (hud.phase === "ready") {
      return { text: "Başla'ya bas. Fareyle müfrezeyi kaydır, ateş kendiliğinden.", tone: "wait" as const };
    }
    if (hud.phase === "upgrade") {
      return { text: "Bir yükseltme seç.", tone: "you" as const };
    }
    if (hud.phase === "over") {
      return { text: "Müfreze tükendi.", tone: "done" as const };
    }
    return { text: "Yeşil kapıya ateş et, büyüt, içinden geç.", tone: "idle" as const };
  }, [failed, ready, hud.phase]);

  return (
    <GameShell
      columns={9}
      rows={14}
      hud={[
        { label: "Dalga", value: hud.wave },
        { label: "Birim", value: hud.units, tone: hud.units <= 2 ? "alert" : undefined },
        { label: "Puan", value: hud.score },
        { label: "Silah", value: hud.weapon },
      ]}
      actions={
        hud.phase === "ready" ? (
          <Button size="small" type="primary" onClick={begin} disabled={!ready}>
            Başla
          </Button>
        ) : (
          <Button size="small" onClick={restart}>
            Yeni oyun
          </Button>
        )
      }
      status={status}
      overlay={
        isOver ? (
          <GameOutcome
            tone="lost"
            title="Hat düştü"
            detail={`${hud.wave}. dalga, ${hud.score} puan`}
            isRecord={isRecord}
            onRestart={restart}
          />
        ) : hud.phase === "upgrade" ? (
          <div className="ct-gunline-offer" role="dialog" aria-label="Yükseltme seç">
            <p className="ct-gunline-offer-title">{hud.wave}. dalga temiz</p>
            <div className="ct-gunline-cards">
              {hud.offer.map((upgrade) => (
                <button
                  key={upgrade.id}
                  type="button"
                  className="ct-gunline-card"
                  data-rarity={upgrade.rarity}
                  onClick={() => take(upgrade.id)}
                >
                  <strong className="ct-gunline-card-label">{upgrade.label}</strong>
                  <span className="ct-gunline-card-detail">{upgrade.detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null
      }
    >
      <div className="ct-gunline-board" data-state={isOver ? "lost" : undefined}>
        <canvas
          ref={canvasRef}
          className="ct-gunline-canvas"
          aria-label="Nişan hattı sahnesi"
          onPointerMove={aim}
          onPointerDown={(event) => {
            aim(event);
            begin();
          }}
        />
      </div>
    </GameShell>
  );
}
