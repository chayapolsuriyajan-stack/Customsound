# Return by Death Checkmate

Chrome extension that plays `capture.mp3` (Subaru's "Return by Death" sound) when a game ends in checkmate on chess.com or lichess.org — for either player.

## Install
1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this `checkmate-sound-extension` folder.
3. Play a game; the sound plays on checkmate.

Detection watches the move list for a `#` move and the game-over banner for "checkmate". Chrome may block audio until you've clicked on the page once (normal when playing a game).
