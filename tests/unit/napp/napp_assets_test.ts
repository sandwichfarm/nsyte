import "../../test-setup-global.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { calculateFileHash } from "../../../src/lib/files.ts";
import type { UploadResponse } from "../../../src/lib/upload.ts";
import type { FileEntry } from "../../../src/lib/nostr.ts";
import type { ISigner } from "applesauce-signers";
import {
  classifyAssetInput,
  deriveAssetMime,
  isRootSite,
  parseCategoriesInput,
  parseCountriesInput,
  resolveNappAsset,
  rootSiteMigrationNotice,
  uploadNappAsset,
} from "../../../src/lib/napp/assets.ts";

const HEX64 = "a".repeat(64);

// A throwaway signer; uploadNappAsset never actually signs when processFn is faked.
const fakeSigner = {} as unknown as ISigner;

describe("classifyAssetInput (pure)", () => {
  it("returns hash for a 64-char hex string", () => {
    assertEquals(classifyAssetInput(HEX64), "hash");
    assertEquals(classifyAssetInput("F".repeat(64)), "hash");
  });

  it("returns url for an http(s) string", () => {
    assertEquals(classifyAssetInput("https://example.com/icon.png"), "url");
    assertEquals(classifyAssetInput("http://example.com/icon.png"), "url");
  });

  it("returns path for everything else", () => {
    assertEquals(classifyAssetInput("./icon.png"), "path");
    assertEquals(classifyAssetInput("foo.png"), "path");
    assertEquals(classifyAssetInput("/abs/icon.png"), "path");
    assertEquals(classifyAssetInput("not-64-hex"), "path");
  });
});

describe("deriveAssetMime (pure)", () => {
  it("maps recognizable image extensions to their MIME", () => {
    assertEquals(deriveAssetMime("x.png"), "image/png");
    assertEquals(deriveAssetMime("x.svg"), "image/svg+xml");
    assertEquals(deriveAssetMime("x.webp"), "image/webp");
    assertEquals(deriveAssetMime("x.jpg"), "image/jpeg");
    assertEquals(deriveAssetMime("x.jpeg"), "image/jpeg");
    assertEquals(deriveAssetMime("x.gif"), "image/gif");
    assertEquals(deriveAssetMime("x.avif"), "image/avif");
  });

  it("falls back to image/png for non-image / unknown extensions and hashes", () => {
    assertEquals(deriveAssetMime(HEX64), "image/png");
    assertEquals(deriveAssetMime("x.xyz"), "image/png");
    assertEquals(deriveAssetMime("noext"), "image/png");
  });
});

describe("parseCategoriesInput (pure)", () => {
  it("prepends napp. only when missing, trims, drops blanks, preserves order", () => {
    assertEquals(
      parseCategoriesInput([
        "social:network",
        "napp.utilities:text editor",
        "  ",
        " games:rpg ",
      ]),
      ["napp.social:network", "napp.utilities:text editor", "napp.games:rpg"],
    );
  });

  it("returns [] for an all-blank input", () => {
    assertEquals(parseCategoriesInput(["", "   "]), []);
  });
});

describe("parseCountriesInput (pure)", () => {
  it('returns ["*"] for empty or wildcard input', () => {
    assertEquals(parseCountriesInput(""), ["*"]);
    assertEquals(parseCountriesInput("   "), ["*"]);
    assertEquals(parseCountriesInput("*"), ["*"]);
  });

  it("splits on commas, trims, drops blanks", () => {
    assertEquals(parseCountriesInput("US, de"), ["US", "de"]);
    assertEquals(parseCountriesInput("US,,de , "), ["US", "de"]);
  });
});

describe("isRootSite (pure)", () => {
  it("is true when id is missing or empty, false otherwise", () => {
    assertEquals(isRootSite({}), true);
    assertEquals(isRootSite({ id: "" }), true);
    assertEquals(isRootSite({ id: null }), true);
    assertEquals(isRootSite({ id: "x" }), false);
  });
});

describe("rootSiteMigrationNotice (pure)", () => {
  it("names the kinds, orphaning, and gateway change", () => {
    const notice = rootSiteMigrationNotice();
    assert(notice.includes("15128"));
    assert(notice.includes("35128"));
    assert(notice.toLowerCase().includes("orphan"));
    assert(notice.toLowerCase().includes("gateway"));
  });
});

describe("resolveNappAsset (boundary)", () => {
  it("returns {hash,mime} for a hash WITHOUT calling upload", async () => {
    let called = false;
    const failUpload = (_p: string): Promise<{ hash: string; mime: string }> => {
      called = true;
      return Promise.reject(new Error("upload should not be called"));
    };
    const asset = await resolveNappAsset(HEX64, failUpload);
    assertEquals(asset, { hash: HEX64, mime: "image/png" });
    assertEquals(called, false);
  });

  it("returns {hash,mime} for a URL WITHOUT calling upload", async () => {
    let called = false;
    const failUpload = (_p: string): Promise<{ hash: string; mime: string }> => {
      called = true;
      return Promise.reject(new Error("upload should not be called"));
    };
    const asset = await resolveNappAsset("https://x/icon.svg", failUpload);
    assertEquals(asset, { hash: "https://x/icon.svg", mime: "image/svg+xml" });
    assertEquals(called, false);
  });

  it("delegates a local path to the injected upload fn", async () => {
    const fakeUpload = (p: string): Promise<{ hash: string; mime: string }> =>
      Promise.resolve({ hash: "UPLOADED:" + p, mime: "image/png" });
    const asset = await resolveNappAsset("./x.png", fakeUpload);
    assertEquals(asset, { hash: "UPLOADED:./x.png", mime: "image/png" });
  });
});

function successResponse(file: FileEntry): UploadResponse {
  return {
    file,
    success: true,
    serverResults: { "https://s": { success: true } },
  };
}

function failedResponse(file: FileEntry): UploadResponse {
  return {
    file,
    success: false,
    error: "all servers failed",
    serverResults: { "https://s": { success: false, error: "nope" } },
  };
}

describe("uploadNappAsset (with fake processFn)", () => {
  it("computes sha256+mime and returns them on success", async () => {
    const file = await Deno.makeTempFile({ suffix: ".png" });
    try {
      await Deno.writeFile(file, new Uint8Array([1, 2, 3, 4]));
      const expectedHash = await calculateFileHash(file);

      let captured: FileEntry | undefined;
      const fakeProcess = (entries: FileEntry[]) => {
        captured = entries[0];
        return Promise.resolve([successResponse(entries[0])]);
      };

      const asset = await uploadNappAsset(
        file,
        { servers: ["https://s"], relays: ["wss://r"], signer: fakeSigner },
        fakeProcess,
      );
      assertEquals(asset, { hash: expectedHash, mime: "image/png" });
      // FileEntry construction: sha256, contentType, data present.
      assert(captured, "processFn should be called");
      assertEquals(captured!.sha256, expectedHash);
      assertEquals(captured!.contentType, "image/png");
      assertEquals(captured!.size, 4);
      assert(captured!.data instanceof Uint8Array);
    } finally {
      await Deno.remove(file);
    }
  });

  it("throws when servers is empty", async () => {
    const file = await Deno.makeTempFile({ suffix: ".png" });
    try {
      await Deno.writeFile(file, new Uint8Array([1, 2, 3, 4]));
      await assertRejects(
        () =>
          uploadNappAsset(
            file,
            { servers: [], relays: ["wss://r"], signer: fakeSigner },
            () => Promise.resolve([]),
          ),
        Error,
        "server",
      );
    } finally {
      await Deno.remove(file);
    }
  });

  it("throws when relays is empty (pre-empts processUploads generic error)", async () => {
    const file = await Deno.makeTempFile({ suffix: ".png" });
    try {
      await Deno.writeFile(file, new Uint8Array([1, 2, 3, 4]));
      await assertRejects(
        () =>
          uploadNappAsset(
            file,
            { servers: ["https://s"], relays: [], signer: fakeSigner },
            () => Promise.resolve([]),
          ),
        Error,
        "relay",
      );
    } finally {
      await Deno.remove(file);
    }
  });

  it("throws when the file is missing", async () => {
    const dir = await Deno.makeTempDir();
    try {
      await assertRejects(
        () =>
          uploadNappAsset(
            `${dir}/nope.png`,
            { servers: ["https://s"], relays: ["wss://r"], signer: fakeSigner },
            () => Promise.resolve([]),
          ),
        Error,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  it("throws when the file is empty", async () => {
    const file = await Deno.makeTempFile({ suffix: ".png" });
    try {
      await assertRejects(
        () =>
          uploadNappAsset(
            file,
            { servers: ["https://s"], relays: ["wss://r"], signer: fakeSigner },
            () => Promise.resolve([]),
          ),
        Error,
        "empty",
      );
    } finally {
      await Deno.remove(file);
    }
  });

  it("throws when the upload did not succeed", async () => {
    const file = await Deno.makeTempFile({ suffix: ".png" });
    try {
      await Deno.writeFile(file, new Uint8Array([1, 2, 3, 4]));
      await assertRejects(
        () =>
          uploadNappAsset(
            file,
            { servers: ["https://s"], relays: ["wss://r"], signer: fakeSigner },
            (entries: FileEntry[]) => Promise.resolve([failedResponse(entries[0])]),
          ),
        Error,
      );
    } finally {
      await Deno.remove(file);
    }
  });
});
