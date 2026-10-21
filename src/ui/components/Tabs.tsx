import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  panel: ReactNode;
}

interface TabsProps<K extends string> {
  label: string;
  items: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
  /**
   * Vertical tabs (the compact layout's rail, D125): the tab list stands
   * alone and the panels sit in a separate container with its own id, which
   * is left out while `collapsed`.
   */
  vertical?: { panelsId: string; collapsed: boolean };
}

// WAI-ARIA tabs with automatic activation and a roving tab stop.
export function Tabs<K extends string>({
  label,
  items,
  selected,
  onSelect,
  vertical,
}: TabsProps<K>) {
  const baseId = useId();
  const tabRefs = useRef(new Map<K, HTMLButtonElement>());
  const [back, forward] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex((item) => item.key === selected);
    let next: number;
    switch (event.key) {
      case forward:
        next = (index + 1) % items.length;
        break;
      case back:
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = items[next];
    if (target) {
      onSelect(target.key);
      tabRefs.current.get(target.key)?.focus();
    }
  }

  const list = (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : undefined}
      className="tabs__list"
    >
      {items.map((item) => {
        const isSelected = item.key === selected;
        return (
          <button
            key={item.key}
            ref={(el) => {
              if (el) tabRefs.current.set(item.key, el);
              else tabRefs.current.delete(item.key);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.key}`}
            aria-selected={isSelected}
            aria-controls={vertical?.collapsed === true ? undefined : `${baseId}-panel-${item.key}`}
            tabIndex={isSelected ? 0 : -1}
            className="tabs__tab"
            onKeyDown={move}
            onClick={() => {
              onSelect(item.key);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  const panels = items.map((item) => (
    <div
      key={item.key}
      role="tabpanel"
      id={`${baseId}-panel-${item.key}`}
      aria-labelledby={`${baseId}-tab-${item.key}`}
      hidden={item.key !== selected}
      className="tabs__panel"
      tabIndex={0}
    >
      {item.key === selected ? item.panel : null}
    </div>
  ));

  if (vertical) {
    return (
      <div className="tabs tabs--vertical">
        {list}
        {!vertical.collapsed && (
          <div id={vertical.panelsId} className="tabs__drawer">
            {panels}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tabs">
      {list}
      {panels}
    </div>
  );
}
