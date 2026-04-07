import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  calculatePropagationStats,
  getPropagationDisplay,
} from "../../src/lib/propagation-stats.ts";
import type { FileEntryWithSources } from "../../src/lib/nostr.ts";

function makeFile(relayCount: number, serverCount: number): FileEntryWithSources {
  return {
    path: "/test.html",
    sha256: "abc123",
    eventId: "evt1",
    foundOnRelays: Array.from({ length: relayCount }, (_, i) => `wss://relay${i}.example.com`),
    availableOnServers: Array.from(
      { length: serverCount },
      (_, i) => `https://server${i}.example.com`,
    ),
  };
}

describe("calculatePropagationStats", () => {
  describe("empty/zero inputs", () => {
    it("empty files array returns broken/broken with all-zero stats", () => {
      const result = calculatePropagationStats([], 3, 3);
      assertEquals(result.relayStrength, "broken");
      assertEquals(result.serverStrength, "broken");
      assertEquals(result.relayStats.totalRelays, 0);
      assertEquals(result.relayStats.filesWithAllRelays, 0);
      assertEquals(result.relayStats.averageCoverage, 0);
      assertEquals(result.relayStats.totalPropagation, 0);
      assertEquals(result.serverStats.totalServers, 0);
      assertEquals(result.serverStats.filesWithAllServers, 0);
      assertEquals(result.serverStats.averageCoverage, 0);
      assertEquals(result.serverStats.totalPropagation, 0);
    });

    it("totalRelays=0 and totalServers=0 returns broken/broken (zero network nodes path)", () => {
      const files = [makeFile(0, 0)];
      const result = calculatePropagationStats(files, 0, 0);
      assertEquals(result.relayStrength, "broken");
      assertEquals(result.serverStrength, "broken");
      assertEquals(result.relayStats.totalRelays, 0);
      assertEquals(result.serverStats.totalServers, 0);
    });
  });

  describe("relay strength levels", () => {
    it("1 relay -> fragile", () => {
      const files = [makeFile(1, 1)];
      const result = calculatePropagationStats(files, 1, 1);
      assertEquals(result.relayStrength, "fragile");
    });

    it("2 relays -> weak", () => {
      const files = [makeFile(2, 2)];
      const result = calculatePropagationStats(files, 2, 2);
      assertEquals(result.relayStrength, "weak");
    });

    it("3 relays, 100% propagation -> nominal", () => {
      // 3 files each on all 3 relays: averageCoverage=3, totalPropagation=100%
      const files = [makeFile(3, 3), makeFile(3, 3), makeFile(3, 3)];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.relayStrength, "nominal");
    });

    it("5 relays, >95% but <100% propagation -> strong", () => {
      // 20 files: 19 on all 5 relays, 1 on 4 relays
      // averageCoverage = (19*5 + 4)/20 = 99/20 = 4.95
      // totalPropagation = (4.95/5)*100 = 99%
      const files = [
        ...Array.from({ length: 19 }, () => makeFile(5, 3)),
        makeFile(4, 3),
      ];
      const result = calculatePropagationStats(files, 5, 3);
      assertEquals(result.relayStrength, "strong");
    });

    it("3-4 relays, mixed coverage -> average", () => {
      // 4 relays, files with varying coverage (propagation < 95%)
      const files = [makeFile(2, 3), makeFile(1, 3), makeFile(3, 3), makeFile(2, 3)];
      const result = calculatePropagationStats(files, 4, 3);
      assertEquals(result.relayStrength, "average");
    });

    it("5+ relays, low propagation -> average (default fallback)", () => {
      // 5 relays, 10 files each on 3/5 relays: averageCoverage=3, propagation=60%
      const files = Array.from({ length: 10 }, () => makeFile(3, 3));
      const result = calculatePropagationStats(files, 5, 3);
      assertEquals(result.relayStrength, "average");
    });
  });

  describe("server strength levels", () => {
    it("1 server -> fragile", () => {
      const files = [makeFile(3, 1)];
      const result = calculatePropagationStats(files, 3, 1);
      assertEquals(result.serverStrength, "fragile");
    });

    it("2 servers -> weak", () => {
      const files = [makeFile(3, 2)];
      const result = calculatePropagationStats(files, 3, 2);
      assertEquals(result.serverStrength, "weak");
    });

    it("3 servers, 100% propagation -> nominal", () => {
      // 3 files each on all 3 servers: averageCoverage=3, totalPropagation=100%
      const files = [makeFile(3, 3), makeFile(3, 3), makeFile(3, 3)];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.serverStrength, "nominal");
    });

    it("3 servers, >95% but <100% propagation -> strong", () => {
      // 20 files: 19 on all 3 servers, 1 on 2 servers
      // averageCoverage = (19*3 + 2)/20 = 59/20 = 2.95
      // totalPropagation = (2.95/3)*100 ≈ 98.3%
      const files = [
        ...Array.from({ length: 19 }, () => makeFile(3, 3)),
        makeFile(3, 2),
      ];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.serverStrength, "strong");
    });

    it("3 servers, low propagation -> average", () => {
      // 3 servers, files mostly on 1/3 servers: propagation < 95%
      const files = [makeFile(3, 1), makeFile(3, 1), makeFile(3, 2)];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.serverStrength, "average");
    });
  });

  describe("stats calculation", () => {
    it("averageCoverage is correct (2 files: one on 3 relays, one on 1 relay, totalRelays=3 -> averageCoverage=2.0)", () => {
      const files = [makeFile(3, 3), makeFile(1, 3)];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.relayStats.averageCoverage, 2.0);
    });

    it("filesWithAllRelays counts correctly (3 files, 2 on all relays -> filesWithAllRelays=2)", () => {
      const files = [makeFile(3, 3), makeFile(3, 3), makeFile(1, 3)];
      const result = calculatePropagationStats(files, 3, 3);
      assertEquals(result.relayStats.filesWithAllRelays, 2);
    });

    it("totalPropagation percentage is correct ((averageCoverage/totalNodes)*100)", () => {
      // 2 files: 1 on 3 relays, 1 on 1 relay; totalRelays=3
      // averageCoverage = (3+1)/2 = 2.0
      // totalPropagation = (2.0/3)*100 ≈ 66.67
      const files = [makeFile(3, 3), makeFile(1, 3)];
      const result = calculatePropagationStats(files, 3, 3);
      const expected = (2.0 / 3) * 100;
      assertEquals(result.relayStats.totalPropagation, expected);
    });
  });
});

describe("getPropagationDisplay", () => {
  it("broken -> label 'Broken', symbol '✗'", () => {
    const display = getPropagationDisplay("broken");
    assertEquals(display.label, "Broken");
    assertEquals(display.symbol, "✗");
    assertStringIncludes(display.color("test"), "test");
  });

  it("fragile -> label 'Fragile', symbol '⚠'", () => {
    const display = getPropagationDisplay("fragile");
    assertEquals(display.label, "Fragile");
    assertEquals(display.symbol, "⚠");
    assertStringIncludes(display.color("test"), "test");
  });

  it("weak -> label 'Weak', symbol '◐'", () => {
    const display = getPropagationDisplay("weak");
    assertEquals(display.label, "Weak");
    assertEquals(display.symbol, "◐");
    assertStringIncludes(display.color("test"), "test");
  });

  it("average -> label 'Average', symbol '◑'", () => {
    const display = getPropagationDisplay("average");
    assertEquals(display.label, "Average");
    assertEquals(display.symbol, "◑");
    assertStringIncludes(display.color("test"), "test");
  });

  it("strong -> label 'Strong', symbol '◕'", () => {
    const display = getPropagationDisplay("strong");
    assertEquals(display.label, "Strong");
    assertEquals(display.symbol, "◕");
    assertStringIncludes(display.color("test"), "test");
  });

  it("nominal -> label 'Nominal', symbol '●'", () => {
    const display = getPropagationDisplay("nominal");
    assertEquals(display.label, "Nominal");
    assertEquals(display.symbol, "●");
    assertStringIncludes(display.color("test"), "test");
  });
});
