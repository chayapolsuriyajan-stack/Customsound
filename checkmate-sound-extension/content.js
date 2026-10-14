(() => {
  const audio = new Audio(chrome.runtime.getURL("zero-return-by-death-trimmed.mp3"));
  audio.preload = "auto";

  // offsetMs > 0 delays the sound; offsetMs < 0 plays it earlier by skipping into the clip.
  const settings = { offsetMs: 0, volume: 1 };
  function applySettings(s) {
    if (typeof s.offsetMs === "number") settings.offsetMs = s.offsetMs;
    if (typeof s.volume === "number") settings.volume = s.volume;
    audio.volume = settings.volume;
  }
  try {
    chrome.storage.sync.get(settings, applySettings);
    chrome.storage.onChanged.addListener((changes) => {
      const s = {};
      for (const k in changes) s[k] = changes[k].newValue;
      applySettings(s);
    });
  } catch (e) {}

  const isLichess = location.hostname.endsWith("lichess.org");

  // Last move in the move list, as SAN text (checkmate moves end with '#').
  function lastMoveText() {
    const selector = isLichess
      ? "l4x kwdb, .moves kwdb, .tview2 move, rm6 move, .buttons + .moves move"
      : "wc-simple-move-list .node .node-highlight-content, .move-list-controls-move, .main-line-row .node-highlight-content";
    const nodes = document.querySelectorAll(selector);
    return nodes.length ? nodes[nodes.length - 1].textContent.trim() : "";
  }

  function gameOverText() {
    const selector = isLichess
      ? ".result-wrap, .rcontrols .result, .status, .game__meta__infos .status"
      : ".game-over-modal-container, .game-over-header-component, .board-modal-container-container, .game-result";
    let text = "";
    document.querySelectorAll(selector).forEach((el) => (text += " " + el.textContent));
    return text.toLowerCase();
  }

  function isCheckmate() {
    if (lastMoveText().endsWith("#")) return true;
    return gameOverText().includes("checkmate");
  }

  function play() {
    const offset = settings.offsetMs;
    const start = () => {
      audio.currentTime = offset < 0 ? -offset / 1000 : 0;
      audio.play().catch(() => {});
      // Observable from the page (and tests); the content script runs in an isolated world.
      document.documentElement.dispatchEvent(
        new CustomEvent("return-by-death-played", { detail: { startAt: audio.currentTime, volume: audio.volume } })
      );
    };
    if (offset > 0) setTimeout(start, offset);
    else start();
  }

  // Play once per game state (URL + last move). A page that loads already
  // checkmated (a finished game being reviewed) is marked as played without sound.
  let lastPlayedKey = isCheckmate() ? location.pathname + "|" + lastMoveText() : null;

  function check() {
    if (!isCheckmate()) return;
    const k = location.pathname + "|" + lastMoveText();
    if (k === lastPlayedKey) return;
    lastPlayedKey = k;
    play();
  }

  // Check on the next animation frame after DOM changes: no artificial debounce delay.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      check();
    });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Test hook for the options page / debugging.
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.type === "return-by-death-test") play();
  });
})();
