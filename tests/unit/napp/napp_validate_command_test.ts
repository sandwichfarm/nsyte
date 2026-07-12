import "../../test-setup-global.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import {
  assembleValidateReport,
  detectNip07InText,
  registerNappCommand,
  scanDirForNip07Evidence,
} from "../../../src/commands/napp.ts";
import { isNapp, validateNappConfig } from "../../../src/lib/napp/detect.ts";

describe("detectNip07InText (pure helper)", () => {
  it("detects window.nostr / getPublicKey usage", () => {
    assert(
      detectNip07InText(
        "if (window.nostr) { await window.nostr.getPublicKey(); }",
      ),
    );
  });
  it("detects nostr-login import", () => {
    assert(detectNip07InText("import 'nostr-login'"));
  });
  it("detects nip07 token", () => {
    assert(detectNip07InText("const x = nip07;"));
  });
  it("is case-insensitive", () => {
    assert(detectNip07InText("WINDOW.NOSTR.GETPUBLICKEY()"));
  });
  it("returns false for plain text with no evidence", () => {
    assertFalse(detectNip07InText("plain static html with no nostr"));
  });
});

describe("scanDirForNip07Evidence (temp dir)", () => {
  it("returns true when any scanned file contains an evidence token", async () => {
    const dir = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(
        join(dir, "app.js"),
        "const pk = await window.nostr.getPublicKey();",
      );
      assert(await scanDirForNip07Evidence(dir));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  it("returns false when no scanned file contains a token", async () => {
    const dir = await Deno.makeTempDir();
    try {
      await Deno.writeTextFile(
        join(dir, "index.html"),
        "<html><body>hello</body></html>",
      );
      assertFalse(await scanDirForNip07Evidence(dir));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  it("tolerates a nonexistent dir (returns false, no throw)", async () => {
    const dir = await Deno.makeTempDir();
    await Deno.remove(dir, { recursive: true });
    assertFalse(await scanDirForNip07Evidence(join(dir, "gone")));
  });
});

describe("assembleValidateReport (pure helper)", () => {
  it("structural errors drive ok=false; NIP-07 only sets a note", () => {
    assertEquals(
      assembleValidateReport({ structuralErrors: [], nip07Found: false }),
      { ok: true, structuralErrors: [], nip07: "warn" },
    );
    assertEquals(
      assembleValidateReport({
        structuralErrors: [{ path: "/napp/name", message: "is required" }],
        nip07Found: true,
      }),
      {
        ok: false,
        structuralErrors: [{ path: "/napp/name", message: "is required" }],
        nip07: "pass",
      },
    );
  });

  it("NIP-07 never flips ok to false", () => {
    const r = assembleValidateReport({
      structuralErrors: [],
      nip07Found: false,
    });
    assert(r.ok);
    assertEquals(r.nip07, "warn");
  });
});

describe("validate wiring (no action call)", () => {
  it("non-napp config -> isNapp false", () => {
    assertFalse(isNapp({ relays: [], servers: [] }));
  });

  it("napp with missing name -> structural errors -> ok=false", () => {
    const errors = validateNappConfig({
      icon: { hash: "h", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assert(errors.length > 0);
    assertFalse(
      assembleValidateReport({ structuralErrors: errors, nip07Found: false })
        .ok,
    );
  });

  it("valid napp -> no structural errors -> ok=true", () => {
    const errors = validateNappConfig({
      name: { value: "App" },
      icon: { hash: "h", mime: "image/png" },
      categories: ["napp.games:rpg"],
      countries: ["*"],
    });
    assertEquals(errors, []);
    assert(
      assembleValidateReport({ structuralErrors: errors, nip07Found: false })
        .ok,
    );
  });
});

describe("napp validate subcommand registration", () => {
  it("registerNappCommand() does not throw (registers validate)", () => {
    registerNappCommand();
  });
});
