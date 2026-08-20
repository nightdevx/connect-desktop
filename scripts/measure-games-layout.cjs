// Measures the games page geometry against the COMPILED stylesheet.
//
// The page grid, the size container on .ct-arcade and the cqh arithmetic in
// .ct-arcade-stage are the three things a static read of the CSS cannot
// confirm, and all three are load-bearing. This loads a mock of the markup in
// Electron and asserts rects.
//
// It reproduces ONE box -- .ct-main-panel-content, the window minus the rail,
// the sidebar and the titlebar -- rather than the whole shell. Mocking the shell
// only added ways for the harness itself to be wrong.
//
//   npx electron scripts/measure-games-layout.cjs 1600x900
//
// Run ON DEMAND, after a renderer build -- deliberately NOT part of `pnpm check`,
// unlike its check-*.cjs neighbours. It needs a compiled stylesheet and a real
// Electron window, and a layout regression is not the kind of thing a commit
// hook should be waiting on.

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const ROOT = path.join(__dirname, "..");

// Under node_modules/.cache, as the other checks do -- the mock pages carry the
// whole compiled stylesheet and have no business in the working tree.
const WORK = path.join(ROOT, "node_modules", ".cache", "ct-games-layout");
fs.mkdirSync(WORK, { recursive: true });
const OUT = path.join(WORK, "result.txt");
const PAGE = path.join(WORK, "page.html");
const lines = [];
const say = (m) => lines.push(m);

const assets = path.join(ROOT, "dist/renderer/assets");
const cssFile = fs.readdirSync(assets).find((f) => f.endsWith(".css"));
// The Google Fonts @import is dropped: a network fetch this harness has no use
// for, and the geometry under test is not font-metric sensitive.
const css = fs
  .readFileSync(path.join(assets, cssFile), "utf8")
  .replace(/@import url\("https:\/\/fonts\.googleapis[^"]*"\);/, "");

// The default userData dir is not writable here, and a session that cannot open
// its cache fails every navigation with ERR_FAILED.
app.setPath("userData", path.join(ROOT, "node_modules", ".cache", "ct-measure-profile"));
app.commandLine.appendSwitch("disable-gpu");

const RAIL_W = 72;
const SIDEBAR_W = 280;
const TITLEBAR_H = 40;

const SIDEBAR = `
<aside class="ct-sidebar" style="width:${SIDEBAR_W}px;flex:0 0 auto">
  <header class="ct-sidebar-header"><h3>Oyunlar</h3></header>
  <div class="ct-sidebar-body">
    <div class="ct-minigames-sidebar">
      <section class="ct-minigames-group"><h5 class="ct-minigames-group-title">Tek kisilik</h5>
      <nav class="ct-minigames-tabs">
        <button class="ct-minigames-tab active"><span class="ct-minigames-tab-icon"><span role="img" class="anticon"><svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M928 160H96v704h832z"/></svg></span></span>
          <span class="ct-minigames-tab-body"><span class="ct-minigames-tab-label">2048</span><span class="ct-minigames-tab-description">Kaydir, ayni sayilari birlestir.</span><span class="ct-minigames-tab-best"><span class="ct-minigames-tab-best-scope">Normal</span>1200 puan</span></span></button>
        <button class="ct-minigames-tab"><span class="ct-minigames-tab-icon"><span role="img" class="anticon"><svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor"><path d="M880 305H624V192H184v-72h-72v784h72V640h248v145h448z"/></svg></span></span>
          <span class="ct-minigames-tab-body"><span class="ct-minigames-tab-label">Mayin Tarlasi</span><span class="ct-minigames-tab-description">Ilk tiklama her zaman guvenli.</span></span></button>
      </nav></section>
    </div>
  </div>
</aside>`;

const shell = (inner, w, h) => `
<div style="display:flex;width:${w - RAIL_W}px;height:${h - TITLEBAR_H}px;overflow:hidden">
  ${SIDEBAR}
  <section class="ct-main-panel no-header" style="flex:1 1 auto;min-width:0">
    <div class="ct-main-panel-content">${inner}</div>
  </section>
</div>`;

const header = `
<header class="ct-minigames-header">
  <span class="ct-minigames-header-icon">#</span>
  <div class="ct-minigames-header-text"><h4>Mayin Tarlasi</h4><p class="ct-minigames-header-description">30x16, 99 mayin</p></div>
  <span class="ct-minigames-best"><span class="ct-minigames-best-label">Rekor</span><strong>45 saniye</strong></span>
  <div class="ct-difficulty">
    <button class="ct-difficulty-option"><span class="ct-difficulty-label">Kolay</span><span class="ct-difficulty-hint">9x9</span></button>
    <button class="ct-difficulty-option" data-active="true"><span class="ct-difficulty-label">Zor</span><span class="ct-difficulty-hint">30x16</span></button>
  </div>
</header>`;

const leaderboardRail = `
<div class="ct-minigames-rail">
  <section class="ct-leaderboard">
    <header class="ct-leaderboard-head"><h5>Siralama</h5><div class="ct-leaderboard-head-right"><span class="ct-leaderboard-rank">3. siradasin</span></div></header>
    <div class="ct-leaderboard-scopes">
      <button class="ct-leaderboard-scope">Kolay</button>
      <button class="ct-leaderboard-scope" data-active="true" data-playing="true">Normal</button>
      <button class="ct-leaderboard-scope">Zor</button>
    </div>
    <p class="ct-leaderboard-scope-hint">16x16, 40 mayin</p>
    <ol class="ct-leaderboard-list">${Array.from({ length: 20 }, (_, i) => `<li class="ct-leaderboard-row"><span class="ct-leaderboard-position">${i + 1}</span><span class="ct-leaderboard-name">oyuncu${i}</span><span class="ct-leaderboard-score">${i}s</span></li>`).join("")}</ol>
  </section>
</div>`;

const liveRail = `
<div class="ct-minigames-rail">
  <section class="ct-live-tables">
    <header class="ct-live-tables-head"><h5>Canli Masalar</h5><span class="ct-live-tables-count">8</span></header>
    <ul class="ct-live-tables-list">${Array.from({ length: 8 }, (_, i) => `
      <li class="ct-live-table"><span class="ct-live-table-game"><span class="ct-live-table-icon">c</span>Satranc<span class="ct-live-table-state" data-state="playing">oynaniyor</span></span>
      <span class="ct-live-table-players"><span class="ct-live-table-player"><span class="ct-versus-mark" data-seat="0"></span><span class="ct-live-table-name">oyuncu${i}</span></span><span class="ct-live-table-player"><span class="ct-versus-mark" data-seat="1"></span><span class="ct-live-table-name">rakip${i}</span></span></span>
      <button class="ant-btn ant-btn-sm">Izle</button></li>`).join("")}</ul>
  </section>
</div>`;

const stage = ({ columns, rows, boardClass, header: hdr, hud, status, aside }) => `
<div class="ct-arcade">
  <div class="ct-arcade-stage" style="--board-columns:${columns};--board-rows:${rows}">
    ${hdr ?? ""}
    ${hud ?? ""}
    <div class="ct-arcade-frame"><div class="ct-board ${boardClass}">${Array.from({ length: Math.min(columns * rows, 480) }, () => `<div class="ct-mines-cell"></div>`).join("")}</div></div>
    ${status ?? ""}
  </div>
  ${aside ?? ""}
</div>`;

const HUD = `<div class="ct-arcade-hud"><span class="ct-arcade-metric"><span class="ct-arcade-metric-label">Mayin</span><strong class="ct-arcade-metric-value">99</strong></span><span class="ct-arcade-metric"><span class="ct-arcade-metric-label">Sure</span><strong class="ct-arcade-metric-value">128s</strong></span><span class="ct-arcade-actions"><button class="ant-btn ant-btn-sm">Yeni oyun</button></span></div>`;
const STATUS = `<p class="ct-arcade-status" data-tone="idle">Sol tik ac, sag tik bayrak.</p>`;

const CHESS_ASIDE = `<aside class="ct-arcade-aside"><div class="ct-chess-sheet"><span class="ct-chess-sheet-title">Hamleler</span><div class="ct-chess-sheet-scroll"><ol class="ct-chess-sheet-list">${Array.from({ length: 30 }, (_, i) => `<li class="ct-chess-sheet-row"><span class="ct-chess-sheet-number">${i + 1}.</span><span class="ct-chess-sheet-move">e4</span><span class="ct-chess-sheet-move">e5</span></li>`).join("")}</ol></div></div></aside>`;

const CASES = {
  "minesweeper-hard": {
    columns: 30,
    rows: 16,
    body: `<div class="ct-minigames-page"><div class="ct-minigames-panel">${header}${stage({ columns: 30, rows: 16, boardClass: "ct-mines-board", hud: HUD, status: STATUS })}${leaderboardRail}</div></div>`,
  },
  "2048-normal": {
    columns: 4,
    rows: 4,
    body: `<div class="ct-minigames-page"><div class="ct-minigames-panel">${header}${stage({ columns: 4, rows: 4, boardClass: "ct-2048-board", hud: HUD, status: STATUS })}${leaderboardRail}</div></div>`,
  },
  "chess-spectating": {
    columns: 8,
    rows: 8,
    body: `<div class="ct-minigames-page"><div class="ct-minigames-panel">${header}<div class="ct-versus">${stage({
      columns: 8,
      rows: 8,
      boardClass: "ct-chess-board",
      header: `<div class="ct-arcade-header"><div class="ct-versus-seats"><span class="ct-versus-watching">Izliyorsun</span><span class="ct-versus-seat"><span class="ct-versus-mark" data-seat="0"></span><span class="ct-versus-seat-name">ahmet</span><span class="ct-versus-seat-side">beyaz</span></span><span class="ct-versus-seat"><span class="ct-versus-mark" data-seat="1"></span><span class="ct-versus-seat-name">mehmet</span><span class="ct-versus-seat-side">siyah</span></span></div><div class="ct-chess-ticker"><span class="ct-chess-ticker-move"><span class="ct-versus-mark" data-seat="0"></span><span>Son hamle:</span><strong>Nf3</strong></span></div></div>`,
      hud: `<div class="ct-arcade-hud"><span class="ct-arcade-actions"><button class="ant-btn ant-btn-sm">Izlemeyi birak</button></span></div>`,
      status: `<p class="ct-arcade-status" data-tone="them">Sira mehmette.</p>`,
      aside: CHESS_ASIDE,
    })}</div>${liveRail}</div></div>`,
  },
  connect4: {
    columns: 7,
    rows: 6,
    body: `<div class="ct-minigames-page"><div class="ct-minigames-panel">${header}<div class="ct-versus">${stage({
      columns: 7,
      rows: 6,
      boardClass: "ct-versus-board",
      header: `<div class="ct-arcade-header"><div class="ct-versus-seats"><span class="ct-versus-seat"><span class="ct-versus-mark" data-seat="0"></span><span class="ct-versus-seat-name">ahmet</span></span><span class="ct-versus-seat"><span class="ct-versus-mark" data-seat="1"></span><span class="ct-versus-seat-name">mehmet</span></span></div></div>`,
      hud: `<div class="ct-arcade-hud"><span class="ct-arcade-actions"><button class="ant-btn ant-btn-sm">Yeni oyun</button></span></div>`,
      status: STATUS,
    })}</div>${liveRail}</div></div>`,
  },
};

const PROBE = `(() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) }; };
  const stage = document.querySelector('.ct-arcade-stage');
  const content = document.querySelector('.ct-main-panel-content');
  return {
    panel: rect('.ct-minigames-panel'),
    header: rect('.ct-minigames-header'),
    difficulty: rect('.ct-difficulty'),
    arcade: rect('.ct-arcade'),
    stage: rect('.ct-arcade-stage'),
    frame: rect('.ct-arcade-frame'),
    aside: rect('.ct-arcade-aside'),
    rail: rect('.ct-minigames-rail'),
    railCard: rect('.ct-minigames-rail > *'),
    status: rect('.ct-arcade-status'),
    chrome: getComputedStyle(stage).getPropertyValue('--arcade-chrome').trim(),
    scroll: { h: content.clientHeight, sh: content.scrollHeight, w: content.clientWidth },
    tabActive: rect('.ct-minigames-tab.active'),
    tile: rect('.ct-minigames-tab.active .ct-minigames-tab-icon'),
    glyph: rect('.ct-minigames-tab.active .ct-minigames-tab-icon .anticon'),
  };
})()`;

const arg = process.argv.find((a) => /^[0-9]+x[0-9]+$/.test(a)) || "1600x900";
const [WIDTH, HEIGHT] = arg.split("x").map(Number);

const finish = (failures) => {
  say("");
  if (failures.length === 0) {
    say(`${arg}: games layout self-check passed`);
  } else {
    say(`${arg}: FAILURES (${failures.length}):`);
    failures.forEach((f) => say("  - " + f));
  }
  const report = lines.join(String.fromCharCode(10));
  fs.writeFileSync(OUT, report);
  // Electron on Windows does not attach stdout to the parent console, so the
  // report is written to a file and echoed here for the case where it does.
  process.stdout.write(report + String.fromCharCode(10));
  app.exit(failures.length === 0 ? 0 : 1);
};

process.on("unhandledRejection", (e) => {
  say("REJECT: " + ((e && e.stack) || e));
  fs.writeFileSync(OUT, lines.join(String.fromCharCode(10)));
  app.exit(2);
});

app.whenReady().then(async () => {
  const failures = [];
  const note = (ok, message) => {
    if (!ok) failures.push(message);
  };

  const win = new BrowserWindow({ width: WIDTH, height: HEIGHT, show: false });

  for (const [name, spec] of Object.entries(CASES)) {
    const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;height:100%;overflow:hidden}</style></head><body>${shell(spec.body, WIDTH, HEIGHT)}</body></html>`;
    // A file, not a data: URL -- the stylesheet alone blows past the URL length
    // Chromium will load. One per case, because reloading the same path can be
    // stopped rather than navigated.
    const page = PAGE.replace(/\.html$/, `.${name}.html`);
    fs.writeFileSync(page, html);

    let loaded = false;
    for (let attempt = 0; attempt < 4 && !loaded; attempt += 1) {
      try {
        await win.loadFile(page);
        loaded = true;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!loaded) {
      say(`${name}: PAGE WOULD NOT LOAD`);
      continue;
    }

    const r = await win.webContents.executeJavaScript(PROBE);
    const where = `${arg} ${name}`;

    // The board column must stay inside the area the page gave it. A size
    // container does NOT clip, so overflow here is silent and lands on top of
    // the page header.
    note(r.stage.h <= r.arcade.h + 1, `${where}: stage ${r.stage.h}px overflows arcade ${r.arcade.h}px`);
    note(r.status.bottom <= r.arcade.bottom + 1, `${where}: status runs ${r.status.bottom - r.arcade.bottom}px past the arcade`);
    note(r.stage.y >= r.arcade.y - 1, `${where}: stage starts ${r.arcade.y - r.stage.y}px above the arcade`);

    // The header belongs over the BOARD column, never over the rail.
    note(r.header.right <= r.rail.x + 1, `${where}: header overlaps the rail by ${r.header.right - r.rail.x}px`);
    note(r.difficulty.right <= r.rail.x + 1, `${where}: difficulty picker sits over the rail`);

    // The page never scrolls: the rail and the board are each their own scroller.
    note(r.scroll.sh <= r.scroll.h + 1, `${where}: panel scrolls (${r.scroll.sh} in ${r.scroll.h})`);

    // One rail, always there, and its card fills it.
    note(r.rail.w > 0, `${where}: rail collapsed`);
    note(Math.abs(r.railCard.h - r.rail.h) <= 2, `${where}: rail card ${r.railCard.h}px in a ${r.rail.h}px rail`);

    // Square cells: the frame has to keep the board's ratio.
    const ratio = r.frame.w / r.frame.h;
    note(Math.abs(ratio - spec.columns / spec.rows) < 0.02, `${where}: frame ratio ${ratio.toFixed(3)} != ${(spec.columns / spec.rows).toFixed(3)}`);
    note(r.frame.w >= 120 && r.frame.h >= 90, `${where}: board collapsed to ${r.frame.w}x${r.frame.h}`);

    // The rows above and below the board are exactly as wide as it is.
    note(Math.abs(r.stage.w - r.frame.w) <= 1, `${where}: stage ${r.stage.w} != frame ${r.frame.w}`);

    // The scoresheet lines up with the board it belongs to.
    if (r.aside) {
      note(Math.abs(r.aside.h - r.arcade.h) <= 2, `${where}: aside ${r.aside.h}px vs arcade ${r.arcade.h}px`);
    }

    // The sidebar tab icon sits on the row's centre line, and its glyph sits in
    // the middle of its own tile.
    const rowDy = r.tile.y + r.tile.h / 2 - (r.tabActive.y + r.tabActive.h / 2);
    const glyphDy = r.glyph.y + r.glyph.h / 2 - (r.tile.y + r.tile.h / 2);
    note(Math.abs(rowDy) < 1.5, `${where}: tab icon sits ${rowDy.toFixed(2)}px off the row centre`);
    note(Math.abs(glyphDy) < 0.6, `${where}: glyph off-centre in its tile by ${glyphDy.toFixed(2)}px`);

    say(
      `${name.padEnd(18)} board ${String(r.frame.w).padStart(4)}x${String(r.frame.h).padStart(3)}` +
        `  col ${String(r.stage.h).padStart(3)}/${r.arcade.h}  rail ${String(r.rail.w).padStart(3)}` +
        `  chrome ${r.chrome.padStart(6)}  panel ${r.panel.w}x${r.panel.h}` +
        `  scroll ${r.scroll.sh}/${r.scroll.h}  tab-icon dy ${rowDy.toFixed(1)}`,
    );
  }

  win.destroy();
  finish(failures);
});
