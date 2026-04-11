// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  collapseAllGroups,
  createInitialViewState,
  expandAllGroups,
  goBackToEventList,
  groupTagsByFirstElement,
  navigateDown,
  navigateUp,
  selectEvent,
  toggleGroup,
} from "../../../src/ui/dry-run/state.ts";
import type { DryRunEvent } from "../../../src/lib/dry-run/types.ts";

const testEvent: DryRunEvent = {
  label: "Site Manifest (kind 35128)",
  kind: 35128,
  template: {
    kind: 35128,
    created_at: 1700000000,
    tags: [
      ["d", "my-site"],
      ["path", "/index.html", "abc123"],
      ["path", "/style.css", "def456"],
      ["path", "/script.js", "ghi789"],
      ["server", "https://blossom.example.com"],
      ["relay", "wss://relay.example.com"],
      ["relay", "wss://relay2.example.com"],
      ["title", "My Site"],
      ["description", "A test blog"],
      ["client", "nsyte"],
    ],
    content: "",
  },
  filename: "manifest-35128.json",
};

const testEvents: DryRunEvent[] = [
  testEvent,
  {
    label: "App Handler (kind 31990)",
    kind: 31990,
    template: {
      kind: 31990,
      created_at: 1700000000,
      tags: [["d", "handler"], ["k", "1"], ["k", "30023"]],
      content: "",
    },
    filename: "app-handler-31990.json",
  },
];

describe("groupTagsByFirstElement", () => {
  it("groups tags by tag[0] value", () => {
    const groups = groupTagsByFirstElement(testEvent.template.tags);
    const pathGroup = groups.find((g) => g.name === "path");
    assertEquals(pathGroup?.count, 3);
    assertEquals(pathGroup?.tags.length, 3);
  });

  it("sorts groups with d first, path second", () => {
    const groups = groupTagsByFirstElement(testEvent.template.tags);
    assertEquals(groups[0].name, "d");
    assertEquals(groups[1].name, "path");
  });

  it("returns correct count for each group", () => {
    const groups = groupTagsByFirstElement(testEvent.template.tags);
    const relayGroup = groups.find((g) => g.name === "relay");
    assertEquals(relayGroup?.count, 2);
    const titleGroup = groups.find((g) => g.name === "title");
    assertEquals(titleGroup?.count, 1);
  });

  it("handles empty tags array", () => {
    const groups = groupTagsByFirstElement([]);
    assertEquals(groups.length, 0);
  });
});

describe("createInitialViewState", () => {
  it("creates state with event-list view mode", () => {
    const state = createInitialViewState(testEvents);
    assertEquals(state.viewMode, "event-list");
    assertEquals(state.selectedEventIndex, 0);
    assertEquals(state.events.length, 2);
  });
});

describe("selectEvent", () => {
  it("switches to tag-tree view and groups tags", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    assertEquals(state.viewMode, "tag-tree");
    assertEquals(state.tagGroups.length > 0, true);
    assertEquals(state.selectedGroupIndex, 0);
  });
});

describe("goBackToEventList", () => {
  it("switches back to event-list view", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    goBackToEventList(state);
    assertEquals(state.viewMode, "event-list");
    assertEquals(state.tagGroups.length, 0);
  });
});

describe("toggleGroup", () => {
  it("expands a collapsed group", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    toggleGroup(state, "path");
    assertEquals(state.expandedGroups.has("path"), true);
  });

  it("collapses an expanded group", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    toggleGroup(state, "path");
    toggleGroup(state, "path");
    assertEquals(state.expandedGroups.has("path"), false);
  });
});

describe("expandAllGroups / collapseAllGroups", () => {
  it("expands all groups", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    expandAllGroups(state);
    for (const group of state.tagGroups) {
      assertEquals(state.expandedGroups.has(group.name), true);
    }
  });

  it("collapses all groups", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    expandAllGroups(state);
    collapseAllGroups(state);
    assertEquals(state.expandedGroups.size, 0);
  });
});

describe("navigation", () => {
  it("navigateDown moves to next event in event-list mode", () => {
    const state = createInitialViewState(testEvents);
    navigateDown(state);
    assertEquals(state.selectedEventIndex, 1);
  });

  it("navigateUp moves to previous event in event-list mode", () => {
    const state = createInitialViewState(testEvents);
    navigateDown(state);
    navigateUp(state);
    assertEquals(state.selectedEventIndex, 0);
  });

  it("navigateDown does not exceed event count", () => {
    const state = createInitialViewState(testEvents);
    navigateDown(state);
    navigateDown(state);
    navigateDown(state); // past end
    assertEquals(state.selectedEventIndex, 1);
  });

  it("navigateUp does not go below 0", () => {
    const state = createInitialViewState(testEvents);
    navigateUp(state);
    assertEquals(state.selectedEventIndex, 0);
  });

  it("navigateDown moves to next group in tag-tree mode", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    navigateDown(state);
    assertEquals(state.selectedGroupIndex, 1);
  });

  it("navigateUp moves to previous group in tag-tree mode", () => {
    const state = createInitialViewState(testEvents);
    selectEvent(state, 0);
    navigateDown(state);
    navigateUp(state);
    assertEquals(state.selectedGroupIndex, 0);
  });
});
