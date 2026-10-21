import { lazy, Suspense, useEffect, useRef, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { EthicsNotice } from '../components/EthicsNotice';
import { Tabs, type TabItem } from '../components/Tabs';
import { coverageCopy } from '../copy/data';
import { shellCopy } from '../copy/shell';
import { useAppStore, type CentreView, type RightPanel } from '../state/store';
import { CoveragePanel } from './CoveragePanel';
import { ImportDialog } from './ImportDialog';
import { LayerPanel } from './LayerPanel';
import { MapControls } from './MapControls';
import { CompareView } from './CompareView';
import { ExplorePanel } from './ExplorePanel';
import { MapView } from './MapView';
import { MatrixTab } from './MatrixTab';
import { MemberPanel } from './MemberPanel';
import { MembersView } from './MembersView';
import { StatusLine } from './StatusLine';
import { TableView } from './TableView';
import { TopBar } from './TopBar';
import { WeightPanel } from './WeightPanel';
import { exploreCopy } from '../copy/explore';
import { savedViewsCopy } from '../copy/savedViews';
import { InsightsPanel } from './InsightsPanel';
import { PresentationView } from './PresentationView';
import { SavedViewsPanel } from './SavedViewsPanel';
import { weightsCopy } from '../copy/weights';
import { DRAWER_ID, LayoutContext, ReadOnlyContext, useLayoutMode } from '../state/layoutMode';

// The survey tools are loaded when the Survey tab is first opened.
const SurveyTab = lazy(() => import('./survey/SurveyTab').then((m) => ({ default: m.SurveyTab })));

const centreItems: readonly TabItem<CentreView>[] = [
  { key: 'map', label: shellCopy.centreTabs.map, panel: <MapView /> },
  { key: 'matrix', label: shellCopy.centreTabs.matrix, panel: <MatrixTab /> },
  { key: 'table', label: shellCopy.centreTabs.table, panel: <TableView /> },
  { key: 'compare', label: shellCopy.centreTabs.compare, panel: <CompareView /> },
  { key: 'members', label: shellCopy.centreTabs.members, panel: <MembersView /> },
  {
    key: 'survey',
    label: shellCopy.centreTabs.survey,
    panel: (
      <Suspense fallback={<p className="placeholder">{shellCopy.loadingSurvey}</p>}>
        <SurveyTab />
      </Suspense>
    ),
  },
];

const rightItems: readonly TabItem<RightPanel>[] = [
  { key: 'member', label: shellCopy.rightTabs.member, panel: <MemberPanel /> },
  { key: 'explore', label: exploreCopy.tab, panel: <ExplorePanel /> },
  { key: 'insights', label: shellCopy.rightTabs.insights, panel: <InsightsPanel /> },
  { key: 'views', label: savedViewsCopy.tab, panel: <SavedViewsPanel /> },
  { key: 'coverage', label: coverageCopy.tab, panel: <CoveragePanel /> },
];

// Analyst workspace, docs/design-system.md §5.1: fixed left column, fluid
// centre, fixed right column, under a top bar and its status line. In the
// compact layout (D125) the left column collapses to a rail, the right column
// is a rail of tabs whose panels open as a drawer over the map's right edge,
// and the status line sits inline in the top bar.
export function Workspace() {
  const ui = useAppStore((s) => s.ui);
  const setCentreView = useAppStore((s) => s.setCentreView);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const setLeftOpen = useAppStore((s) => s.setLeftOpen);
  const setRightOpen = useAppStore((s) => s.setRightOpen);
  const closeNotice = useAppStore((s) => s.closeNotice);
  const hasProject = useAppStore((s) => (s.data.project?.members.length ?? 0) > 0);
  const mode = useLayoutMode();
  const readOnly = mode === 'phone';
  const compact = mode === 'compact';
  const drawerOpen = compact && ui.rightOpen;
  // On the root element, so presentation mode follows the same layout (styles/layout.css).
  useEffect(() => {
    document.documentElement.dataset.layout = mode;
  }, [mode]);

  // Focus moves with the column toggles, which replace each other, and the
  // drawer returns focus to where it was opened from when it closes.
  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusAfter = useRef<'left' | 'drawer' | null>(null);
  useEffect(() => {
    if (focusAfter.current === 'left') leftToggle.current?.focus();
    focusAfter.current = null;
  }, [ui.leftOpen]);
  useEffect(() => {
    if (!compact) return;
    if (drawerOpen) {
      const active = document.activeElement as HTMLElement | null;
      const panels = document.getElementById(DRAWER_ID);
      if (active && active !== document.body && !panels?.contains(active)) {
        opener.current = active;
      }
      if (focusAfter.current === 'drawer') {
        drawerRef.current
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus();
      }
    } else {
      // Focus still in the column, or lost with the drawer, goes back to the opener;
      // a panel that moved focus elsewhere itself (to the map) keeps it there.
      const active = document.activeElement;
      const inColumn = !active || active === document.body || drawerRef.current?.contains(active);
      if (focusAfter.current === 'drawer' && inColumn) {
        const back = opener.current;
        if (back?.isConnected && !back.closest('[hidden]')) back.focus();
        else rightToggle.current?.focus();
      }
      opener.current = null;
    }
    focusAfter.current = null;
  }, [drawerOpen, compact]);
  const closeDrawer = () => {
    focusAfter.current = 'drawer';
    setRightOpen(false);
  };
  const onDrawerKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // A control that handled Escape itself (a menu, a view being renamed) keeps the
    // drawer open; the member panel's Escape closes the panel, and the drawer with it.
    if (e.key !== 'Escape' || !drawerOpen) return;
    if (e.defaultPrevented && (e.target as HTMLElement).closest('.member') === null) return;
    closeDrawer();
  };

  // The roster editor and the survey tools change the project, so the read-only
  // phone layout leaves them out.
  const editing = (key: CentreView) => key === 'members' || key === 'survey';
  const centre = readOnly ? centreItems.filter((item) => !editing(item.key)) : centreItems;
  const centreView = readOnly && editing(ui.centreView) ? 'map' : ui.centreView;
  const showMapControls = hasProject && centreView === 'map';

  if (ui.presentation) {
    return (
      <>
        <PresentationView />
        <EthicsNotice open={ui.noticeOpen} onClose={closeNotice} />
      </>
    );
  }

  const controls = (
    <>
      {hasProject && (
        <section className="workspace__section" aria-labelledby="weights-heading">
          <h2 id="weights-heading" className="panel-heading">
            {weightsCopy.heading}
          </h2>
          <WeightPanel />
        </section>
      )}
      {showMapControls && (
        <section className="workspace__section" aria-labelledby="map-controls-heading">
          <h2 id="map-controls-heading" className="panel-heading">
            {shellCopy.left.map}
          </h2>
          <MapControls />
        </section>
      )}
    </>
  );

  const toggleLeft = () => {
    focusAfter.current = 'left';
    setLeftOpen(!ui.leftOpen);
  };
  const leftColumn = readOnly ? (
    // On a phone the controls fold away above the view, so the view comes first on screen.
    hasProject && (
      <details className="workspace__left workspace__fold">
        <summary className="workspace__fold-summary">{shellCopy.phone.controls}</summary>
        <div className="workspace__fold-body">{controls}</div>
      </details>
    )
  ) : compact && !ui.leftOpen ? (
    <aside className="workspace__left workspace__rail" aria-label={shellCopy.regions.left}>
      <button
        ref={leftToggle}
        type="button"
        className="workspace__rail-button"
        aria-expanded={false}
        onClick={toggleLeft}
      >
        <Icon name="chevron-right" />
        <span className="workspace__rail-label">{shellCopy.compact.left}</span>
      </button>
    </aside>
  ) : (
    <aside className="workspace__left" aria-label={shellCopy.regions.left}>
      {compact && (
        <button
          ref={leftToggle}
          type="button"
          className="workspace__collapse"
          aria-expanded={true}
          aria-label={shellCopy.compact.left}
          title={shellCopy.compact.left}
          onClick={toggleLeft}
        >
          <Icon name="chevron-left" />
        </button>
      )}
      {controls}
      <section aria-labelledby="layers-heading">
        <h2 id="layers-heading" className="panel-heading">
          {shellCopy.left.heading}
        </h2>
        <LayerPanel />
      </section>
    </aside>
  );

  const rightColumn = compact ? (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the drawer from anywhere in it
    <aside
      ref={drawerRef}
      className="workspace__right workspace__rail workspace__rail--right"
      aria-label={shellCopy.regions.right}
      onKeyDown={onDrawerKeyDown}
    >
      <button
        ref={rightToggle}
        type="button"
        className="workspace__collapse"
        aria-expanded={drawerOpen}
        aria-controls={drawerOpen ? DRAWER_ID : undefined}
        aria-label={shellCopy.compact.right}
        title={drawerOpen ? shellCopy.compact.close : shellCopy.compact.right}
        onClick={() => {
          // Closed by its toggle, focus stays on the toggle.
          if (drawerOpen) setRightOpen(false);
          else {
            focusAfter.current = 'drawer';
            setRightOpen(true);
          }
        }}
      >
        {/* Open, the toggle is the drawer's close button. */}
        <Icon name={drawerOpen ? 'close' : 'chevron-left'} />
      </button>
      <Tabs
        label={shellCopy.regions.right}
        items={rightItems}
        selected={ui.rightPanel}
        onSelect={setRightPanel}
        vertical={{ panelsId: DRAWER_ID, collapsed: !drawerOpen }}
      />
    </aside>
  ) : (
    <aside className="workspace__right" aria-label={shellCopy.regions.right}>
      <Tabs
        label={shellCopy.regions.right}
        items={rightItems}
        selected={ui.rightPanel}
        onSelect={setRightPanel}
      />
    </aside>
  );

  return (
    <LayoutContext.Provider value={mode}>
      <ReadOnlyContext.Provider value={readOnly}>
        <div className="workspace" data-layout={mode}>
          <TopBar status={compact ? <StatusLine inline /> : undefined} />
          {!compact && <StatusLine />}
          {leftColumn}
          <main className="workspace__centre" aria-label={shellCopy.regions.centre}>
            {readOnly && <p className="workspace__read-only">{shellCopy.phone.readOnly}</p>}
            <Tabs
              label={shellCopy.regions.centre}
              items={centre}
              selected={centreView}
              onSelect={setCentreView}
            />
          </main>
          {rightColumn}
          <ImportDialog />
          <EthicsNotice open={ui.noticeOpen} onClose={closeNotice} />
        </div>
      </ReadOnlyContext.Provider>
    </LayoutContext.Provider>
  );
}
