// The page measure-chat-history.cjs loads: the lobby chat panel and a direct
// message thread, each with a 5 000-message history. Not part of the app build.
import "@/styles/global.css";
import { useCallback, useRef, useState, type ComponentType, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ChatMessage } from "@shared/auth-contracts";
import { LobbyChatPanel } from "@/features/workspace/components/lobby/lobby-chat-panel";
import { DirectChatMessageRow } from "@/features/workspace/components/user/direct-chat-message-row";
import { useThreadScroll } from "@/features/workspace/components/user/use-thread-scroll";

// Absent before the change: the DM thread then renders the way it used to.
const virtualModules = import.meta.glob(
  "/src/renderer/src/features/workspace/components/common/virtual-chat-list.tsx",
  { eager: true },
) as Record<string, { VirtualChatList?: ComponentType<{
  scrollElement: HTMLElement | null;
  messages: ChatMessage[];
  renderMessage: (message: ChatMessage) => ReactNode;
}> }>;
const VirtualChatList = Object.values(virtualModules)[0]?.VirtualChatList ?? null;

const HISTORY = 5_000;
const ME = "user-me";

// Deterministic, so before and after measure the same history.
let seed = 42;
const random = (): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};

const WORDS = "selam bugün akşam oyun oda ses mikrofon yayın ekran harita takım maç tamam olur hadi bekle geliyorum şimdi sonra güzel iyi kötü neden".split(" ");
const sentence = (words: number): string =>
  Array.from({ length: words }, () => WORDS[Math.floor(random() * WORDS.length)]).join(" ");

let counter = 0;
const makeMessage = (minutesAgo: number): ChatMessage => {
  counter += 1;
  const n = counter;
  const author = random() < 0.3 ? ME : `user-${Math.floor(random() * 12)}`;
  const roll = random();
  const body =
    roll < 0.6
      ? `#${n} ${sentence(3 + Math.floor(random() * 10))}`
      : roll < 0.85
        ? `#${n} ${sentence(25 + Math.floor(random() * 40))}`
        : roll < 0.95
          ? `#${n} @me ${sentence(6)}\n${sentence(8)}\n${sentence(5)}`
          : `#${n} https://example.com/${n}`;
  return {
    id: `m-${n}`,
    channel: "bench",
    userId: author,
    username: author === ME ? "me" : author.replace("user-", "kisi"),
    body,
    createdAt: new Date(Date.UTC(2026, 9, 1) - minutesAgo * 60_000).toISOString(),
    editedAt: random() < 0.05 ? new Date().toISOString() : undefined,
    replyTo: random() < 0.08 ? { id: "m-1", username: "kisi1", body: sentence(6) } : null,
    attachment:
      random() < 0.02
        ? { id: `a-${n}`, name: `resim-${n}.png`, mimeType: "image/png", size: 40_000, isImage: true }
        : null,
    reactions: random() < 0.1 ? [{ emoji: "👍", count: 2, userIds: [ME, "user-1"] }] : [],
  };
};

const history = (count: number, offsetMinutes: number): ChatMessage[] =>
  Array.from({ length: count }, (_, index) => makeMessage(offsetMinutes + count - index));

// Images arrive late, like the real attachment fetch, so rows grow after mount.
const imageUrl = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#4a6";
    context.fillRect(0, 0, 320, 180);
  }
  return canvas.toDataURL("image/png");
})();

const noop = async (): Promise<{ ok: false; error: { code: string; message: string } }> => ({
  ok: false,
  error: { code: "BENCH", message: "bench" },
});
(window as unknown as { desktopApi: unknown }).desktopApi = new Proxy(
  {
    getChatAttachment: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, data: { dataUrl: imageUrl } }), 50 + random() * 250),
      ),
  } as Record<string, unknown>,
  { get: (target, key) => (key in target ? target[key as string] : noop) },
);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
// A hidden window may not be given frames; the timeout keeps the run going.
const frame = (): Promise<number> =>
  new Promise((resolve) => {
    const fallback = setTimeout(() => resolve(performance.now()), 250);
    requestAnimationFrame((time) => {
      clearTimeout(fallback);
      resolve(time);
    });
  });

interface Controls {
  append: () => void;
  prependOlder?: () => void;
}

let controls: Controls | null = null;
let olderLoads = 0;

function LobbyHarness({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  controls = { append: () => setMessages((previous) => [...previous, makeMessage(0)]) };
  return (
    <div style={{ width: 400, height: 700, display: "flex" }}>
      <LobbyChatPanel
        currentUserId={ME}
        currentUsername="me"
        lobbyMessagesQuery={{ isPending: false, isError: false, data: { ok: true, data: { messages } } } as never}
        lobbyMessages={messages}
        lobbyMessageDraft={draft}
        setLobbyMessageDraft={setDraft}
        onSendLobbyMessage={() => undefined}
        onDeleteLobbyMessage={() => undefined}
        isSendingLobbyMessage={false}
        deletingLobbyMessageId={null}
      />
    </div>
  );
}

// The thread part of users-direct-messages-panel.tsx: the same container, the
// same scroll hook, the same rows.
function DirectHarness({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setScrollElement(node);
  }, []);
  const olderRef = useRef(0);

  const loadOlder = (): void => {
    setLoadingOlder(true);
    setTimeout(() => {
      olderRef.current += 1;
      olderLoads += 1;
      setMessages((previous) => [...history(80, 100_000 * olderRef.current), ...previous]);
      setLoadingOlder(false);
    }, 30);
  };

  const scroll = useThreadScroll({
    containerRef,
    peerUserId: "peer",
    messageCount: messages.length,
    hasMoreMessages: true,
    isLoadingOlderMessages: loadingOlder,
    onLoadOlderMessages: loadOlder,
  }) as { handleChatScroll: () => void; attachMessageList?: (node: HTMLDivElement | null) => void };

  controls = { append: () => setMessages((previous) => [...previous, makeMessage(0)]) };

  const renderRow = (message: ChatMessage) => (
    <DirectChatMessageRow
      key={message.id}
      message={message}
      isOwnMessage={message.userId === ME}
      isDeleting={false}
      deleteDisabled={false}
      peerLabel="kisi"
      currentUsername="me"
      currentUserId={ME}
      onRequestDelete={() => undefined}
      onReply={() => undefined}
      onEdit={() => undefined}
      onToggleReaction={() => undefined}
    />
  );

  return (
    <div className="ct-chat-thread-box" style={{ width: 900, height: 700 }}>
      <div className="ct-chat-messages" ref={attachScroller} onScroll={scroll.handleChatScroll}>
        <div className="ct-chat-message-list" ref={scroll.attachMessageList}>
          <div className="ct-chat-load-older">
            <span>{loadingOlder ? "Daha eski mesajlar yükleniyor…" : "Daha eskisi için yukarı kaydırın"}</span>
          </div>
          {VirtualChatList ? (
            <VirtualChatList scrollElement={scrollElement} messages={messages} renderMessage={renderRow} />
          ) : (
            messages.map(renderRow)
          )}
        </div>
      </div>
    </div>
  );
}

const scroller = (): HTMLElement => document.querySelector(".ct-chat-messages") as HTMLElement;
const distanceFromBottom = (el: HTMLElement): number => el.scrollHeight - el.scrollTop - el.clientHeight;

// The row the reader is looking at: the first one whose bottom is inside the
// viewport, by its unique "#n" text and its offset from the viewport top.
const firstVisibleRow = (el: HTMLElement): { text: string; top: number } | null => {
  const viewportTop = el.getBoundingClientRect().top;
  for (const row of el.querySelectorAll<HTMLElement>(".ct-chat-row")) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom > viewportTop + 1) {
      const text = /#\d+/.exec(row.textContent ?? "")?.[0] ?? "";
      return { text, top: Math.round(rect.top - viewportTop) };
    }
  }
  return null;
};
const findRowTop = (el: HTMLElement, text: string): number | null => {
  const viewportTop = el.getBoundingClientRect().top;
  for (const row of el.querySelectorAll<HTMLElement>(".ct-chat-row")) {
    if (/#\d+/.exec(row.textContent ?? "")?.[0] === text) {
      return Math.round(row.getBoundingClientRect().top - viewportTop);
    }
  }
  return null;
};

const heapMb = (): number | null => {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null;
};

const runScenario = async (name: "lobby" | "dm"): Promise<Record<string, unknown>> => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const initial = history(HISTORY, 0);
  (window as unknown as { gc?: () => void }).gc?.();
  const heapBefore = heapMb();

  const mountStart = performance.now();
  flushSync(() => root.render(name === "lobby" ? <LobbyHarness initial={initial} /> : <DirectHarness initial={initial} />));
  const el = scroller();
  void el.scrollHeight;
  const mountMs = performance.now() - mountStart;

  await sleep(1_500);
  const result: Record<string, unknown> = {
    virtualized: name === "lobby" ? Boolean(el.querySelector("[data-index]")) : Boolean(VirtualChatList),
    mountMs: Math.round(mountMs),
    domNodes: el.querySelectorAll("*").length,
    renderedRows: el.querySelectorAll(".ct-chat-row").length,
    heapMb: heapMb() !== null && heapBefore !== null ? (heapMb() as number) - heapBefore : null,
    landedAtBottomPx: Math.round(distanceFromBottom(el)),
  };

  // A message arrives while the reader is at the bottom.
  const appendStart = performance.now();
  flushSync(() => controls?.append());
  void el.scrollHeight;
  result.appendMs = Math.round((performance.now() - appendStart) * 10) / 10;
  await sleep(500);
  result.followedNewMessagePx = Math.round(distanceFromBottom(el));

  // A keystroke in the lobby composer re-renders the panel around the list.
  if (name === "lobby") {
    const input = document.querySelector<HTMLInputElement>(".ct-chat-input input");
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const keyStart = performance.now();
      flushSync(() => {
        setter?.call(input, "a");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      void el.scrollHeight;
      result.keystrokeMs = Math.round((performance.now() - keyStart) * 10) / 10;
    }
  }

  // Scroll up a screen at a time, one frame each.
  const frames: number[] = [];
  let last = await frame();
  for (let step = 0; step < 60; step += 1) {
    el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.8);
    const now = await frame();
    frames.push(now - last);
    last = now;
  }
  frames.sort((a, b) => a - b);
  result.scrollFrameMedianMs = Math.round(frames[Math.floor(frames.length / 2)] * 10) / 10;
  result.scrollFrameMaxMs = Math.round(frames[frames.length - 1] * 10) / 10;
  await sleep(500);

  // Reading up the history: a new message must not move what is on screen.
  const reading = firstVisibleRow(el);
  flushSync(() => controls?.append());
  await sleep(500);
  result.readingShiftedOnAppendPx = reading ? Math.abs((findRowTop(el, reading.text) ?? 9_999) - reading.top) : null;

  if (name === "lobby") {
    // An edit in progress survives being scrolled out of view.
    el.scrollTop = el.scrollHeight;
    await sleep(300);
    const editButtons = el.querySelectorAll<HTMLButtonElement>('button[aria-label="Mesajı düzenle"]');
    editButtons[editButtons.length - 1]?.click();
    await sleep(100);
    const editor = el.querySelector("textarea");
    editor?.focus();
    // The window is never shown, so it never has focus and the browser fires
    // no focus events; this is the one a focused window fires.
    editor?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    el.scrollTop = 0;
    await sleep(500);
    result.editSurvivedScrollAway = Boolean(editor?.isConnected && document.activeElement === editor);
  }

  if (name === "dm") {
    // At the top: the next page is pulled in, and the row being read stays put.
    el.scrollTop = 400;
    await sleep(300);
    const loadsBefore = olderLoads;
    el.scrollTop = 60;
    const anchor = firstVisibleRow(el);
    await sleep(800);
    result.olderPagesLoaded = olderLoads - loadsBefore;
    result.anchorShiftedOnPrependPx = anchor ? Math.abs((findRowTop(el, anchor.text) ?? 9_999) - anchor.top) : null;
  }

  root.unmount();
  host.remove();
  return result;
};

(window as unknown as { __run: () => Promise<unknown> }).__run = async () => ({
  lobby: await runScenario("lobby"),
  dm: await runScenario("dm"),
});
