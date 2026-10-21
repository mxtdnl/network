// Workspace regions for scoping an axe scan. The first scan in a test covers
// the whole page; a later scan in the same test covers only the region the
// test has changed since, because every scan carries about 0.9 s of fixed cost
// and a whole-page scan of the demo workspace takes about 3.4 s (the map
// controls alone about 2.4 s; headless Chromium, 2026-10-21). A modal dialog
// makes the rest of the page inert, so a scan while one is open covers it.
export const REGION = {
  top: 'header.top-bar',
  left: 'aside.workspace__left',
  centre: 'main.workspace__centre',
  right: 'aside.workspace__right',
  dialog: 'dialog[open]',
} as const;
