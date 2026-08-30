import {
  GATE_ADD_CAP,
  GATE_ADD_HITS,
  GATE_ARMOR_CAP,
  GATE_CLASS_CAP,
  GATE_MUL_CAP,
  GATE_MUL_HITS,
} from "./tuning";
import type { GateKind, GunlineGate } from "./types";

export function gateHit(gate: GunlineGate): void {
  if (gate.locked) {
    return;
  }

  gate.charge += 1;

  if (gate.kind === "add" || gate.kind === "mine" || gate.kind === "toll") {
    if (gate.charge % GATE_ADD_HITS === 0) {
      gate.value = Math.min(GATE_ADD_CAP, gate.value + 1);
    }
  } else if (gate.kind === "mul") {
    if (gate.charge % GATE_MUL_HITS === 0) {
      gate.value = Math.min(GATE_MUL_CAP, Math.round((gate.value + 0.1) * 10) / 10);
    }
  } else if (gate.kind === "class") {
    if (gate.charge % GATE_ADD_HITS === 0) {
      gate.value = Math.min(GATE_CLASS_CAP, gate.value + 1);
    }
  } else if (gate.kind === "armor") {
    if (gate.charge % GATE_ADD_HITS === 0) {
      gate.value = Math.min(GATE_ARMOR_CAP, gate.value + 1);
    }
  } else if (gate.kind === "ammo") {
    if (gate.charge % GATE_ADD_HITS === 0) {
      gate.value = Math.min(100, gate.value + 10);
    }
  }

  gate.good = isGoodGate(gate);
}

export function isGoodGate(gate: GunlineGate): boolean {
  switch (gate.kind) {
    case "add":
      return gate.value > 0;
    case "mul":
      return gate.value >= 1;
    case "mine":
      return gate.value >= 0;
    case "toll":
      return gate.value > 0;
    default:
      return true;
  }
}

export function gateLabel(gate: GunlineGate): string {
  switch (gate.kind) {
    case "add":
      return `${gate.value > 0 ? "+" : ""}${gate.value}`;
    case "mul":
      return `x${gate.value.toFixed(1)}`;
    case "class":
      return `+${gate.value}`;
    case "weapon":
      return "SİLAH";
    case "ammo":
      return `%${gate.value}`;
    case "armor":
      return `+${gate.value}`;
    case "mine":
      return gate.value >= 0 ? "etkisiz" : `${gate.value}`;
    case "toll":
      return `${gate.value} er`;
    default:
      return "";
  }
}

export function gateIcon(gate: GunlineGate): string {
  switch (gate.kind) {
    case "add":
      return gate.value > 0 ? "+" : "-";
    case "mul":
      return gate.value >= 1 ? "*" : "/";
    case "class":
      return "#";
    case "weapon":
      return ">";
    case "ammo":
      return "^";
    case "armor":
      return "[]";
    case "mine":
      return "!";
    case "toll":
      return "$";
    default:
      return "";
  }
}

export const GATE_KINDS: readonly GateKind[] = [
  "add",
  "mul",
  "class",
  "weapon",
  "ammo",
  "armor",
  "mine",
  "toll",
];
