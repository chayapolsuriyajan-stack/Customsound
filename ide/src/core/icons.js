/** Inline SVG paths, stroked with currentColor so they inherit theme tokens. */
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${extra}<path d="${d}"/></svg>`;

export const icons = {
  files: svg('M4 3h9l5 5v13H4z M13 3v5h5'),
  search: svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4 4'),
  puzzle: svg('M10 3h4v3a2 2 0 1 0 4 0V3h3v4h-3a2 2 0 1 0 0 4h3v6H3V11h3a2 2 0 1 0 0-4H3V3h3v3a2 2 0 1 0 4 0z'),
  newFile: svg('M5 3h8l4 4v14H5z M13 3v4h4 M11 11v6 M8 14h6'),
  newFolder: svg('M3 6h6l2 2h10v11H3z M12 12v5 M9.5 14.5h5'),
  refresh: svg('M20 11a8 8 0 1 0-.6 4 M20 5v6h-6'),
  collapse: svg('M4 6h16 M4 12h10 M4 18h6'),
  chevron: svg('M9 6l6 6-6 6'),
  close: svg('M6 6l12 12 M18 6L6 18'),
};
