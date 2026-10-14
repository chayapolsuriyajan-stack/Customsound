(() => {
  const audio = new Audio(chrome.runtime.getURL("zero-return-by-death-trimmed.mp3"));
  audio.preload = "auto";

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

  // Dedupe: play once per game state (URL + move count) so re-renders don't replay it.
  let lastPlayedKey = null;
  function key() {
    return location.pathname + "|" + lastMoveText();
  }

  let pending = false;
  function check() {
    pending = false;
    if (!isCheckmate()) return;
    const k = key();
    if (k === lastPlayedKey) return;
    lastPlayedKey = k;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(check, 150);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
