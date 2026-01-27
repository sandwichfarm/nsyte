import type { FileEntryWithSources } from "./nostr.ts";
import { colors } from "@cliffy/ansi/colors";

export type PropagationStrength =
  | "broken"
  | "fragile"
  | "weak"
  | "average"
  | "strong"
  | "nominal";

export interface PropagationStats {
  relayStrength: PropagationStrength;
  serverStrength: PropagationStrength;
  relayStats: {
    totalRelays: number;
    filesWithAllRelays: number;
    averageCoverage: number;
    totalPropagation: number;
  };
  serverStats: {
    totalServers: number;
    filesWithAllServers: number;
    averageCoverage: number;
    totalPropagation: number;
  };
}

/**
 * Calculate propagation statistics for a set of files
 */
export function calculatePropagationStats(
  files: FileEntryWithSources[],
  totalRelays: number,
  totalServers: number,
): PropagationStats {
  if (files.length === 0) {
    return {
      relayStrength: "broken",
      serverStrength: "broken",
      relayStats: {
        totalRelays: 0,
        filesWithAllRelays: 0,
        averageCoverage: 0,
        totalPropagation: 0,
      },
      serverStats: {
        totalServers: 0,
        filesWithAllServers: 0,
        averageCoverage: 0,
        totalPropagation: 0,
      },
    };
  }

  // Calculate relay stats
  const relayStatsRaw = calculateNetworkStats(
    files,
    totalRelays,
    (file) => file.foundOnRelays.length,
  );

  // Calculate server stats
  const serverStatsRaw = calculateNetworkStats(
    files,
    totalServers,
    (file) => file.availableOnServers.length,
  );

  const relayStats = {
    totalRelays: relayStatsRaw.totalNodes,
    filesWithAllRelays: relayStatsRaw.filesWithAllNodes,
    averageCoverage: relayStatsRaw.averageCoverage,
    totalPropagation: relayStatsRaw.totalPropagation,
  };

  const serverStats = {
    totalServers: serverStatsRaw.totalNodes,
    filesWithAllServers: serverStatsRaw.filesWithAllNodes,
    averageCoverage: serverStatsRaw.averageCoverage,
    totalPropagation: serverStatsRaw.totalPropagation,
  };

  return {
    relayStrength: determineRelayStrength(relayStatsRaw, totalRelays),
    serverStrength: determineServerStrength(serverStatsRaw, totalServers),
    relayStats,
    serverStats,
  };
}

function calculateNetworkStats(
  files: FileEntryWithSources[],
  totalNetworkNodes: number,
  getFileNodeCount: (file: FileEntryWithSources) => number,
): {
  totalNodes: number;
  filesWithAllNodes: number;
  averageCoverage: number;
  totalPropagation: number;
} {
  if (totalNetworkNodes === 0) {
    return {
      totalNodes: 0,
      filesWithAllNodes: 0,
      averageCoverage: 0,
      totalPropagation: 0,
    };
  }

  const filesWithAllNodes = files.filter(
    (file) => getFileNodeCount(file) === totalNetworkNodes,
  ).length;

  const totalCoverage = files.reduce(
    (sum, file) => sum + getFileNodeCount(file),
    0,
  );

  const averageCoverage = totalCoverage / files.length;
  const totalPropagation = (averageCoverage / totalNetworkNodes) * 100;

  return {
    totalNodes: totalNetworkNodes,
    filesWithAllNodes: filesWithAllNodes,
    averageCoverage,
    totalPropagation,
  };
}

function determineRelayStrength(
  stats: ReturnType<typeof calculateNetworkStats>,
  totalRelays: number,
): PropagationStrength {
  if (totalRelays === 0) return "broken";
  if (totalRelays === 1) return "fragile";
  if (totalRelays === 2) return "weak";

  const propagationPercent = stats.totalPropagation;

  // Nominal: ≥3 relays with 100% propagation
  if (totalRelays >= 3 && propagationPercent >= 100) return "nominal";

  // Strong: ≥5 relays with >95% total propagation
  if (totalRelays >= 5 && propagationPercent > 95) return "strong";

  // Average: 3-4 relays with mixed coverage
  if (totalRelays >= 3 && totalRelays <= 4) return "average";

  // Default to average for other cases
  return "average";
}

function determineServerStrength(
  stats: ReturnType<typeof calculateNetworkStats>,
  totalServers: number,
): PropagationStrength {
  if (totalServers === 0) return "broken";
  if (totalServers === 1) return "fragile";
  if (totalServers < 3) return "weak";

  const propagationPercent = stats.totalPropagation;

  // Nominal: ≥3 servers with 100% propagation
  if (totalServers >= 3 && propagationPercent >= 100) return "nominal";

  // Strong: ≥3 servers with >95% total propagation
  if (totalServers >= 3 && propagationPercent > 95) return "strong";

  // Average: 3+ servers with spotty access (anything else)
  return "average";
}

/**
 * Get display info for propagation strength
 */
export function getPropagationDisplay(strength: PropagationStrength): {
  label: string;
  symbol: string;
  color: (str: string) => string;
} {
  switch (strength) {
    case "broken":
      return {
        label: "Broken",
        symbol: "✗",
        color: colors.red,
      };
    case "fragile":
      return {
        label: "Fragile",
        symbol: "⚠",
        color: colors.yellow,
      };
    case "weak":
      return {
        label: "Weak",
        symbol: "◐",
        color: colors.yellow,
      };
    case "average":
      return {
        label: "Average",
        symbol: "◑",
        color: colors.cyan,
      };
    case "strong":
      return {
        label: "Strong",
        symbol: "◕",
        color: colors.green,
      };
    case "nominal":
      return {
        label: "Nominal",
        symbol: "●",
        color: colors.green,
      };
  }
}
