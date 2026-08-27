/**
 * Keybindings, stored as normalised chord strings ("ctrl+shift+p").
 *
 * Bindings dispatch through the command registry, so an extension contributing
 * a keybinding needs no special path -- it names a command id like anyone else.
 * Meta is folded into ctrl so a single table serves macOS and the rest.
 */
import { executeCommand, hasCommand } from './commands.js';

const bindings = new Map();

export function normalizeChord(chord) {
  const parts = chord.toLowerCase().split('+').map((s) => s.trim());
  const key = parts.pop();
  const mods = new Set(parts.map((m) => (m === 'cmd' || m === 'meta' ? 'ctrl' : m)));
  return [...['ctrl', 'alt', 'shift'].filter((m) => mods.has(m)), key].join('+');
}

export function bindKey(chord, commandId) {
  const key = normalizeChord(chord);
  bindings.set(key, commandId);
  return { dispose: () => { if (bindings.get(key) === commandId) bindings.delete(key); } };
}

/** Reverse lookup so the palette can show "Ctrl+P" next to an entry. */
export function chordFor(commandId) {
  for (const [chord, id] of bindings) {
    if (id === commandId) {
      return chord.split('+')
        .map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
        .join('+');
    }
  }
  return '';
}

function chordFromEvent(e) {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  let key = e.key.toLowerCase();
  if (key === ' ') key = 'space';
  if (key === 'escape') key = 'esc';
  return [...mods, key].join('+');
}

export function installKeymap(target = window) {
  target.addEventListener('keydown', (e) => {
    // Let a focused text input keep plain typing; only chords with a modifier
    // (or Escape) are eligible to be stolen from it.
    const id = bindings.get(chordFromEvent(e));
    if (!id || !hasCommand(id)) return;
    e.preventDefault();
    e.stopPropagation();
    executeCommand(id).catch((err) => console.error(`[minicode] ${id}:`, err));
  }, { capture: true });
}
