import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Popover, Tooltip } from "antd";
import { GifOutlined, LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import type { GifItem } from "@shared/desktop-api-types";

// GIF search for the composer, served by KLIPY through the main process.
//
// Two things drive this shape. First, Tenor is gone -- Google stopped issuing
// keys on 2026-01-13 and shut the API down on 2026-06-30 -- so this had to
// move to KLIPY. Second, the renderer has no environment plumbing at all: the
// old code read `globalThis.CT_TENOR_API_KEY`, vite.config.ts has no `define`
// to put it there, so the value was always undefined and the entire GIF
// feature was dead code in every build ever shipped.
//
// The fix is not a Vite `define`. Baking a key into the renderer bundle is what
// caused the leak: KLIPY takes its key as a URL PATH SEGMENT, and Sentry's
// Breadcrumbs integration records fetch URLs verbatim, so every renderer-side
// search would have attached the key to unrelated error reports. So the key
// stays in main, the fetch happens in main, and the renderer only ever sees
// normalised {id, previewUrl, sendUrl, description} rows.

// Long enough that typing "kedi" is one request instead of four, short enough
// that the grid still feels live. Main throttles harder as a backstop.
const SEARCH_DEBOUNCE_MS = 350;

interface GifPanelProps {
  onPick: (url: string) => void;
}

function GifPanel({ onPick }: GifPanelProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // IPC has no AbortSignal, so a request cannot be cancelled once it is in
  // flight -- it can only be ignored when it lands. Every search takes the next
  // sequence number and only the newest one is allowed to write state, so a
  // slow response for "ke" can never overwrite the results for "kedi".
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = ++latestRequestRef.current;
      setLoading(true);
      setFailed(false);

      void window.desktopApi
        .searchGifs({ query: query.trim() })
        .then((result) => {
          if (requestId !== latestRequestRef.current) {
            return;
          }
          if (result.ok && result.data) {
            setItems(result.data.items);
          } else {
            setFailed(true);
          }
          setLoading(false);
        })
        .catch(() => {
          if (requestId !== latestRequestRef.current) {
            return;
          }
          setFailed(true);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="ct-gif-panel">
      <Input
        allowClear
        size="small"
        autoFocus
        value={query}
        // Matches gifSearchSchema's z.string().max(100) in the main process.
        // Past that the IPC call is rejected at the boundary and the panel just
        // reads "GIF'ler yüklenemedi" forever, with nothing saying why -- one
        // pasted paragraph was enough to do it.
        maxLength={100}
        placeholder="GIF ara…"
        prefix={<SearchOutlined />}
        onChange={(event) => setQuery(event.target.value)}
      />

      {failed && <div className="ct-gif-state">GIF'ler yüklenemedi</div>}

      {!failed && loading && (
        <div className="ct-gif-state">
          <LoadingOutlined /> Yükleniyor…
        </div>
      )}

      {!failed && !loading && items.length === 0 && (
        <div className="ct-gif-state">Sonuç bulunamadı</div>
      )}

      {!failed && !loading && items.length > 0 && (
        <div className="ct-gif-grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ct-gif-cell"
              onClick={() => onPick(item.sendUrl)}
              aria-label={item.description}
              title={item.description}
            >
              <img src={item.previewUrl} alt={item.description} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatGifButtonProps {
  onPick: (url: string) => void;
  disabled?: boolean;
}

function GifPickerButton({ onPick, disabled }: ChatGifButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);

  const handlePick = useCallback(
    (url: string) => {
      setOpen(false);
      onPick(url);
    },
    [onPick],
  );

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      rootClassName="ct-emoji-popover"
      content={<GifPanel onPick={handlePick} />}
    >
      <Tooltip title="GIF ekle">
        <Button
          type="text"
          size="small"
          disabled={disabled}
          icon={<GifOutlined />}
          aria-label="GIF ekle"
        />
      </Tooltip>
    </Popover>
  );
}

// Whether a key is configured is a question only main can answer, so it starts
// as "not yet known" and renders nothing. With no key it stays that way
// forever and the composer looks exactly as it did before GIFs existed -- no
// button, no half-working panel, no error toast.
export function ChatGifButton(props: ChatGifButtonProps): JSX.Element | null {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void window.desktopApi
      .isGifPickerEnabled()
      .then((result) => {
        if (!cancelled && result.ok && result.data?.enabled) {
          setEnabled(true);
        }
      })
      .catch(() => {
        // Unreachable main means no GIF button. Silence is the same outcome as
        // "no key configured", which is the designed default.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled ? <GifPickerButton {...props} /> : null;
}
