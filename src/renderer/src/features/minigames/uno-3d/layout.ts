export const CARD_WIDTH = 0.92;
export const CARD_HEIGHT = 1.38;
export const CARD_THICKNESS = 0.016;
export const CARD_STACK_STEP = 0.021;

export const TABLE_RADIUS = 4.35;

export const FRAME_CENTER = { x: 0, y: 0.1, z: 0.25 };
export const FRAME_HALF_WIDTH = 4.55;
export const FRAME_HALF_DEPTH = 4.7;
export const FRAME_HALF_HEIGHT = 1.7;
export const FRAME_PADDING = 1.02;
export const VIEW_ELEVATION = 0.835;

export const FACE_UP = -Math.PI / 2;
export const FACE_DOWN = Math.PI / 2;

const HAND_RADIUS = 4.2;
const HAND_Y = 0.62;
const HAND_Z = 2.95;
const HAND_TILT = -0.72;
const HAND_MAX_ARC = 1.7;
const HAND_MAX_SPREAD = 0.175;
const HAND_CURVE = 0.32;

export const HAND_LIFT = 0.44;
export const HAND_PULL = 0.26;
export const HAND_HOVER_TILT = -0.42;
export const HAND_HOVER_SCALE = 1.09;

export const OPPONENT_RADIUS = 3.05;
const OPPONENT_SCALE = 0.62;
const OPPONENT_TILT = FACE_DOWN - 0.12;
const OPPONENT_MAX_ARC = 0.92;
const OPPONENT_MAX_SPREAD = 0.16;
const OPPONENT_FAN_RADIUS = 1.9;
const OPPONENT_CURVE = 0.55;

/**
 * How wide an opponent's whole fan is at scale 1, across the table.
 *
 * Derived from the fan's own numbers rather than measured by hand, so it cannot
 * drift out of step with them: the outermost card of the widest fan sits at
 * sin(half the arc) times the fan radius, and the card itself adds its width.
 */
const OPPONENT_FAN_SPAN =
  2 * Math.sin(OPPONENT_MAX_ARC / 2) * OPPONENT_FAN_RADIUS + CARD_WIDTH;

/** How much of the gap between two chairs a fan is allowed to fill. */
const SEAT_CLEARANCE = 0.94;

export const DRAW_PILE = { x: -1.62, z: 0.15 };
export const DISCARD_PILE = { x: 0.62, z: 0.15 };
export const DISCARD_DEPTH = 6;
export const DRAW_STACK_MAX = 16;

function fanOffset(
  tilt: number,
  radius: number,
  curve: number,
  angle: number,
  index: number,
  count: number,
  scale: number,
): { y: number; z: number } {
  const normalY = -Math.sin(tilt);
  const normalZ = Math.cos(tilt);
  const arc = (Math.cos(angle) - 1) * radius * curve;
  const lift =
    (index - (count - 1) / 2) * CARD_STACK_STEP * scale * (normalY >= 0 ? 1 : -1);

  return {
    y: normalZ * arc + normalY * lift,
    z: -normalY * arc + normalZ * lift,
  };
}

const GROUND_CLEARANCE = 0.035;

export function lowestCorner(tilt: number, roll: number, scale: number): number {
  const halfWidth = (CARD_WIDTH / 2) * scale;
  const halfHeight = (CARD_HEIGHT / 2) * scale;

  return (
    (halfWidth * Math.abs(Math.sin(roll)) + halfHeight * Math.abs(Math.cos(roll))) *
    Math.abs(Math.cos(tilt))
  );
}

function feltLift(place: (index: number) => Placement, count: number): number {
  let lift = 0;

  for (const index of [0, count - 1]) {
    const card = place(index);
    const floor = GROUND_CLEARANCE + lowestCorner(card.tilt, card.roll, card.scale);
    lift = Math.max(lift, floor - card.y);
  }

  return Math.max(lift, 0);
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  tilt: number;
  yaw: number;
  roll: number;
  scale: number;
}

const SEAT_LEFT = Math.PI * 1.06;
const SEAT_FAR = Math.PI * 1.5;
const SEAT_RIGHT = Math.PI * 1.94;

/**
 * Where the seat `offset` places away from the viewer sits, in table angles.
 *
 * Everybody else is spread evenly along the arc from the left chair to the
 * right one, going the long way round the far side. Never the whole circle:
 * the near quarter is where the viewer's own hand is, and a table that put an
 * opponent there sat somebody in the player's lap.
 *
 * The arc reproduces the three-seat table it replaced -- one opponent lands on
 * the midpoint, which is the far chair; two land on the ends, which are left
 * and right; three land on left, far and right -- so the small tables did not
 * move when this grew to ten.
 */
export function seatAngle(offset: number, total: number): number {
  if (offset <= 0) {
    return Math.PI / 2;
  }

  const opponents = Math.max(total - 1, 1);
  if (opponents === 1) {
    return SEAT_FAR;
  }

  const step = (SEAT_RIGHT - SEAT_LEFT) / (opponents - 1);
  return SEAT_LEFT + step * (offset - 1);
}

/**
 * How big an opponent's cards are drawn, which is a function of how many
 * opponents there are.
 *
 * Ten chairs on the same arc that held three leaves each one a third of the
 * room, and a fan drawn at the old size would sit in its neighbour. So the fan
 * is scaled to the gap between chairs: the same drawing, smaller, rather than a
 * different layout past some threshold.
 *
 * Capped at the size a small table uses, so two players do not get enormous
 * cards for having elbow room.
 */
export function opponentScale(total: number): number {
  const opponents = Math.max(total - 1, 1);
  if (opponents < 2) {
    return OPPONENT_SCALE;
  }

  const spacing = (SEAT_RIGHT - SEAT_LEFT) / (opponents - 1);
  // The straight-line gap between two neighbouring chairs.
  const gap = 2 * OPPONENT_RADIUS * Math.sin(spacing / 2);

  return Math.min(OPPONENT_SCALE, (gap * SEAT_CLEARANCE) / OPPONENT_FAN_SPAN);
}

export const RING_RADIUS = 1.72;
export const RING_SPEED = 0.26;

/**
 * How far the direction ring turns in `delta` seconds, as a delta on its
 * rotation.y.
 *
 * Negative for the +1 direction, and that sign is the whole point. Play moves
 * to the seat at the NEXT angle -- seatAngle rises with the offset -- but a
 * rotation of +phi about Y maps a point at angle theta to theta - phi. Adding
 * the spin, which is what the ring used to do, ran it backwards against the
 * order of play in every game.
 */
/**
 * Whether a table has a direction worth drawing.
 *
 * Two players do not. They sit opposite each other, so "next" is the same seat
 * whichever way round the table you go -- and the server agrees: a reverse
 * played at a two-handed table is resolved as a skip, because passing the
 * direction on would hand the turn straight back. An arrow spinning on that
 * table is decoration claiming to be information.
 */
export function ringShowsDirection(totalSeats: number): boolean {
  return totalSeats > 2;
}

export function ringSpin(direction: number, delta: number): number {
  return -delta * RING_SPEED * (direction < 0 ? -1 : 1);
}

/**
 * The yaw that points a cone lying flat (already tipped by Rx(PI/2), so its
 * apex is +z) along the ring at `angle`, in the travelling direction.
 *
 * The arrowheads used to be built once with a yaw of -angle whatever the
 * direction was, so they never flipped on a reverse, and the yaw was not even
 * the tangent: it read correctly at angle 0 and pointed across the ring by the
 * time it reached the third arrow.
 */
export function arrowYaw(angle: number, direction: number): number {
  return direction < 0 ? Math.PI - angle : -angle;
}

export function seatYaw(angle: number): number {
  return Math.PI / 2 - angle;
}

export function seatPosition(angle: number): { x: number; z: number } {
  return {
    x: Math.cos(angle) * OPPONENT_RADIUS,
    z: Math.sin(angle) * OPPONENT_RADIUS,
  };
}

function fanAngle(index: number, count: number, maxSpread: number, maxArc: number): number {
  const spread = count > 1 ? Math.min(maxSpread, maxArc / (count - 1)) : 0;
  return (index - (count - 1) / 2) * spread;
}

function rawHandPlacement(index: number, count: number): Placement {
  const angle = fanAngle(index, count, HAND_MAX_SPREAD, HAND_MAX_ARC);
  const offset = fanOffset(HAND_TILT, HAND_RADIUS, HAND_CURVE, angle, index, count, 1);

  return {
    x: Math.sin(angle) * HAND_RADIUS,
    y: HAND_Y + offset.y,
    z: HAND_Z + offset.z,
    tilt: HAND_TILT,
    yaw: 0,
    roll: -angle,
    scale: 1,
  };
}

export function handPlacement(index: number, count: number): Placement {
  const placement = rawHandPlacement(index, count);
  const lift = feltLift((at) => rawHandPlacement(at, count), count);

  return lift > 0 ? { ...placement, y: placement.y + lift } : placement;
}

function rawOpponentPlacement(index: number, count: number, total: number): Placement {
  const scale = opponentScale(total);
  const radius = OPPONENT_FAN_RADIUS * scale;
  const angle = fanAngle(index, count, OPPONENT_MAX_SPREAD, OPPONENT_MAX_ARC);
  const offset = fanOffset(OPPONENT_TILT, radius, OPPONENT_CURVE, angle, index, count, scale);

  return {
    x: Math.sin(angle) * radius,
    y: 0.02 + offset.y,
    z: offset.z,
    tilt: OPPONENT_TILT,
    yaw: 0,
    roll: -angle,
    scale,
  };
}

export function opponentPlacement(index: number, count: number, total: number): Placement {
  const placement = rawOpponentPlacement(index, count, total);
  const lift = feltLift((at) => rawOpponentPlacement(at, count, total), count);

  return lift > 0 ? { ...placement, y: placement.y + lift } : placement;
}

export function drawPlacement(index: number): Placement {
  return {
    x: DRAW_PILE.x,
    y: 0.02 + index * CARD_THICKNESS * 0.85,
    z: DRAW_PILE.z,
    tilt: FACE_DOWN,
    yaw: 0,
    roll: 0.04 * ((index % 3) - 1),
    scale: 1,
  };
}

export function discardPlacement(depth: number, lie: number): Placement {
  const drift = (lie / 6) * 0.09;

  return {
    x: DISCARD_PILE.x + drift,
    y: 0.02 + (DISCARD_DEPTH - depth) * CARD_THICKNESS * 0.9,
    z: DISCARD_PILE.z - drift * 0.6,
    tilt: FACE_UP,
    yaw: 0,
    roll: (lie * Math.PI) / 180,
    scale: 1,
  };
}

export function cardLie(color: string, kind: string): number {
  const text = `${color}${kind}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 13) - 6;
}

export function opponentReach(count: number, total: number): number {
  if (count < 1) {
    return 0;
  }
  const edge = opponentPlacement(0, count, total);
  return Math.hypot(edge.x, edge.z) + (Math.hypot(CARD_WIDTH, CARD_HEIGHT) / 2) * edge.scale;
}

/** The straight-line gap between two neighbouring chairs. */
export function seatGap(total: number): number {
  const opponents = Math.max(total - 1, 1);
  if (opponents < 2) {
    return 2 * OPPONENT_RADIUS;
  }
  const spacing = (SEAT_RIGHT - SEAT_LEFT) / (opponents - 1);
  return 2 * OPPONENT_RADIUS * Math.sin(spacing / 2);
}

/** How wide one opponent's fan is drawn at a table of this size. */
export function opponentFanSpan(total: number): number {
  return OPPONENT_FAN_SPAN * opponentScale(total);
}

export function handReach(count: number): number {
  if (count < 1) {
    return 0;
  }
  return Math.abs(handPlacement(0, count).x) + CARD_WIDTH / 2;
}
