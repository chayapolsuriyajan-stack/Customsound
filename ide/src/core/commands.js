/**
 * Command registry. Everything the IDE can do is a command with an id, which
 * is what lets the palette, the keymap, menus and extensions all reach the
 * same behaviour without knowing about each other.
 */
const commands = new Map();

export function registerCommand(id, run, meta = {}) {
  const prev = commands.get(id);
  // A contributed command starts life as an activation stub; the extension
  // replacing it with the real handler is expected, not a collision.
  if (prev && !prev.stub) console.warn(`[minicode] command "${id}" re-registered`);
  commands.set(id, {
    id,
    run,
    stub: !!meta.stub,
    title: meta.title || prev?.title || id,
    category: meta.category || prev?.category || '',
    when: meta.when,
  });
  return { dispose: () => { if (commands.get(id)?.run === run) commands.delete(id); } };
}

export async function executeCommand(id, ...args) {
  const cmd = commands.get(id);
  if (!cmd) throw new Error(`unknown command: ${id}`);
  return cmd.run(...args);
}

export const hasCommand = (id) => commands.has(id);
export const isStub = (id) => !!commands.get(id)?.stub;

/** Palette entries: everything with a real title, minus `when`-gated misses. */
export function listCommands() {
  return [...commands.values()]
    .filter((c) => c.title !== c.id)
    .filter((c) => (typeof c.when === 'function' ? c.when() : true))
    .sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title));
}
