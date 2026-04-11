import "../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  buildManifestFileMappings,
  findFallbackFile,
  type FilePathMapping,
  type ManifestUploadInput,
} from "../../src/lib/manifest.ts";

const scanned: FilePathMapping[] = [
  { path: "/index.html", sha256: "idx1" },
  { path: "/style.css", sha256: "sty1" },
  { path: "/404.html", sha256: "fb1" },
];

describe("findFallbackFile", () => {
  it("returns null when no fallback path is configured", () => {
    assertEquals(findFallbackFile(undefined, scanned), null);
  });

  it("finds a fallback file with a leading slash", () => {
    assertEquals(findFallbackFile("/404.html", scanned)?.sha256, "fb1");
  });

  it("normalizes fallback paths without a leading slash", () => {
    assertEquals(findFallbackFile("404.html", scanned)?.sha256, "fb1");
  });

  it("returns null when the configured fallback is missing from the scan", () => {
    assertEquals(findFallbackFile("missing.html", scanned), null);
  });
});

describe("buildManifestFileMappings", () => {
  it("returns scanned files as-is when there are no uploads and no fallback", () => {
    const result = buildManifestFileMappings(scanned, [], null);
    assertEquals(result.length, 3);
    assertEquals(result.find((m) => m.path === "/index.html")?.sha256, "idx1");
  });

  it("synthesizes the /404.html entry when a fallback file is supplied", () => {
    const result = buildManifestFileMappings(
      [scanned[0], scanned[1], { path: "/fallback.html", sha256: "fhash" }],
      [],
      { path: "/fallback.html", sha256: "fhash" },
    );
    const fallback = result.find((m) => m.path === "/404.html");
    assertEquals(fallback?.sha256, "fhash");
  });

  it("does not add a /404.html entry when no fallback file is supplied", () => {
    const result = buildManifestFileMappings(
      [scanned[0], scanned[1]],
      [],
      null,
    );
    assertEquals(result.find((m) => m.path === "/404.html"), undefined);
  });

  it("prefers upload-response hashes on duplicates", () => {
    const uploads: ManifestUploadInput[] = [
      { success: true, file: { path: "/index.html", sha256: "idx-upload" } },
    ];
    const result = buildManifestFileMappings(scanned, uploads, null);
    assertEquals(result.find((m) => m.path === "/index.html")?.sha256, "idx-upload");
  });

  it("prefers the fallback upload hash when the fallback file was uploaded this run", () => {
    const fallbackScan: FilePathMapping = { path: "/fallback.html", sha256: "old" };
    const uploads: ManifestUploadInput[] = [
      { success: true, file: { path: "/fallback.html", sha256: "new" } },
    ];
    const result = buildManifestFileMappings(
      [scanned[0], fallbackScan],
      uploads,
      fallbackScan,
    );
    assertEquals(result.find((m) => m.path === "/404.html")?.sha256, "new");
  });

  it("ignores failed upload responses", () => {
    const uploads: ManifestUploadInput[] = [
      { success: false, file: { path: "/index.html", sha256: "bad" } },
    ];
    const result = buildManifestFileMappings(scanned, uploads, null);
    assertEquals(result.find((m) => m.path === "/index.html")?.sha256, "idx1");
  });
});
