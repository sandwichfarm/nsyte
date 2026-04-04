import type { DryRunEvent } from "../../lib/dry-run/types.ts";

/**
 * A group of tags sharing the same tag[0] value.
 */
export interface TagGroup {
  /** The tag[0] value, e.g. "path", "relay", "server", "title" */
  name: string;
  /** Number of tags in this group */
  count: number;
  /** The actual tag arrays */
  tags: string[][];
  /** Whether this group is expanded in the tree view */
  expanded: boolean;
}

/**
 * State for the dry-run TUI inspector.
 */
export interface DryRunViewState {
  events: DryRunEvent[];
  selectedEventIndex: number;
  viewMode: "event-list" | "tag-tree";
  /** Tag groups for the currently viewed event */
  tagGroups: TagGroup[];
  /** Index of the currently selected tag group (in tag-tree view) */
  selectedGroupIndex: number;
  /** Set of group names that are expanded */
  expandedGroups: Set<string>;
  page: number;
  pageSize: number;
}

/**
 * Group event tags by their first element (tag[0]).
 * Returns groups sorted with common Nostr tags first, then alphabetical.
 */
export function groupTagsByFirstElement(tags: string[][]): TagGroup[] {
  const groupMap = new Map<string, string[][]>();

  for (const tag of tags) {
    if (tag.length === 0) continue;
    const key = tag[0];
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(tag);
  }

  // Sort: d first, then path, then others alphabetically
  const sortOrder: Record<string, number> = {
    "d": 0,
    "path": 1,
    "server": 2,
    "relay": 3,
    "title": 4,
    "description": 5,
    "source": 6,
    "client": 7,
    "k": 8,
    "web": 9,
  };

  const groups: TagGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => {
      const orderA = sortOrder[a] ?? 100;
      const orderB = sortOrder[b] ?? 100;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    })
    .map(([name, groupTags]) => ({
      name,
      count: groupTags.length,
      tags: groupTags,
      expanded: false,
    }));

  return groups;
}

/**
 * Create initial view state for the dry-run inspector.
 */
export function createInitialViewState(
  events: DryRunEvent[],
  pageSize: number = 20,
): DryRunViewState {
  return {
    events,
    selectedEventIndex: 0,
    viewMode: "event-list",
    tagGroups: [],
    selectedGroupIndex: 0,
    expandedGroups: new Set(),
    page: 0,
    pageSize,
  };
}

/**
 * Select an event and switch to tag-tree view.
 */
export function selectEvent(state: DryRunViewState, index: number): void {
  if (index < 0 || index >= state.events.length) return;
  state.selectedEventIndex = index;
  state.tagGroups = groupTagsByFirstElement(state.events[index].template.tags);
  state.selectedGroupIndex = 0;
  state.expandedGroups = new Set();
  state.viewMode = "tag-tree";
  state.page = 0;
}

/**
 * Go back to the event list view.
 */
export function goBackToEventList(state: DryRunViewState): void {
  state.viewMode = "event-list";
  state.tagGroups = [];
  state.selectedGroupIndex = 0;
  state.expandedGroups = new Set();
  state.page = 0;
}

/**
 * Toggle expand/collapse for a tag group.
 */
export function toggleGroup(state: DryRunViewState, groupName: string): void {
  if (state.expandedGroups.has(groupName)) {
    state.expandedGroups.delete(groupName);
  } else {
    state.expandedGroups.add(groupName);
  }
}

/**
 * Expand all tag groups.
 */
export function expandAllGroups(state: DryRunViewState): void {
  for (const group of state.tagGroups) {
    state.expandedGroups.add(group.name);
  }
}

/**
 * Collapse all tag groups.
 */
export function collapseAllGroups(state: DryRunViewState): void {
  state.expandedGroups.clear();
}

/**
 * Navigate up in the current view.
 */
export function navigateUp(state: DryRunViewState): void {
  if (state.viewMode === "event-list") {
    if (state.selectedEventIndex > 0) {
      state.selectedEventIndex--;
    }
  } else {
    if (state.selectedGroupIndex > 0) {
      state.selectedGroupIndex--;
    }
  }
}

/**
 * Navigate down in the current view.
 */
export function navigateDown(state: DryRunViewState): void {
  if (state.viewMode === "event-list") {
    if (state.selectedEventIndex < state.events.length - 1) {
      state.selectedEventIndex++;
    }
  } else {
    if (state.selectedGroupIndex < state.tagGroups.length - 1) {
      state.selectedGroupIndex++;
    }
  }
}
