import { Button } from "antd";

interface GameOutcomeProps {
  /** Drives the whole palette, and nothing else about this is branched on. */
  tone: "won" | "lost";
  title: string;
  /** The number the run ended on, already formatted. */
  detail?: string;
  /** True only on the run that actually beat the stored best. */
  isRecord?: boolean;
  onRestart: () => void;
}

/**
 * The end of a run, said out loud.
 *
 * Every game used to end into a 12px muted line under the board, which is the
 * same complaint the two-player hint line had: the board stopped responding and
 * a sentence changed somewhere below it. This sits ON the board instead, so
 * winning and dying are events rather than state changes.
 *
 * One component for four games. What differs between them is a word and a
 * number, both of which are props — a per-game overlay would be four files
 * agreeing about a border radius.
 *
 * The board behind it is left mounted and readable: a minesweeper loss is only
 * interesting because you can see where the mines were, and a 2048 board is
 * worth looking at after it fills. Hence a card, not a curtain.
 */
export function GameOutcome({
  tone,
  title,
  detail,
  isRecord,
  onRestart,
}: GameOutcomeProps) {
  return (
    <div className="ct-outcome" data-tone={tone} role="status" aria-live="polite">
      <div className="ct-outcome-card">
        {isRecord ? <span className="ct-outcome-record">YENİ REKOR</span> : null}
        <strong className="ct-outcome-title">{title}</strong>
        {detail ? <span className="ct-outcome-detail">{detail}</span> : null}
        <Button size="small" type="primary" onClick={onRestart}>
          Yeni oyun
        </Button>
      </div>
    </div>
  );
}
