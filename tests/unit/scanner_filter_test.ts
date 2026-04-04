import { assertEquals } from "@std/assert";
import {
  BINARY_EXTENSIONS,
  hasNullBytes,
  isBinaryExtension,
} from "../../src/lib/scanner/mod.ts";

Deno.test("BINARY_EXTENSIONS", async (t) => {
  await t.step("contains common binary types", () => {
    assertEquals(BINARY_EXTENSIONS.has(".png"), true);
    assertEquals(BINARY_EXTENSIONS.has(".jpg"), true);
    assertEquals(BINARY_EXTENSIONS.has(".wasm"), true);
    assertEquals(BINARY_EXTENSIONS.has(".woff"), true);
    assertEquals(BINARY_EXTENSIONS.has(".woff2"), true);
    assertEquals(BINARY_EXTENSIONS.has(".pdf"), true);
    assertEquals(BINARY_EXTENSIONS.has(".map"), true);
    assertEquals(BINARY_EXTENSIONS.has(".gif"), true);
    assertEquals(BINARY_EXTENSIONS.has(".ico"), true);
  });

  await t.step("does not contain text file types", () => {
    assertEquals(BINARY_EXTENSIONS.has(".js"), false);
    assertEquals(BINARY_EXTENSIONS.has(".html"), false);
    assertEquals(BINARY_EXTENSIONS.has(".css"), false);
    assertEquals(BINARY_EXTENSIONS.has(".ts"), false);
    assertEquals(BINARY_EXTENSIONS.has(".json"), false);
    assertEquals(BINARY_EXTENSIONS.has(".md"), false);
    assertEquals(BINARY_EXTENSIONS.has(".txt"), false);
    assertEquals(BINARY_EXTENSIONS.has(".xml"), false);
  });
});

Deno.test("isBinaryExtension", async (t) => {
  await t.step("returns true for binary files", () => {
    assertEquals(isBinaryExtension("image.png"), true);
    assertEquals(isBinaryExtension("font.woff2"), true);
    assertEquals(isBinaryExtension("app.wasm"), true);
    assertEquals(isBinaryExtension("archive.zip"), true);
    assertEquals(isBinaryExtension("bundle.js.map"), true);
  });

  await t.step("returns false for text files", () => {
    assertEquals(isBinaryExtension("index.html"), false);
    assertEquals(isBinaryExtension("style.css"), false);
    assertEquals(isBinaryExtension("app.js"), false);
    assertEquals(isBinaryExtension("config.json"), false);
    assertEquals(isBinaryExtension(".env"), false);
  });

  await t.step("handles uppercase extensions", () => {
    assertEquals(isBinaryExtension("IMAGE.PNG"), true);
    assertEquals(isBinaryExtension("FONT.WOFF2"), true);
  });

  await t.step("handles paths with directories", () => {
    assertEquals(isBinaryExtension("assets/images/logo.png"), true);
    assertEquals(isBinaryExtension("src/components/App.tsx"), false);
  });
});

Deno.test("hasNullBytes", async (t) => {
  await t.step("returns false for text content", async () => {
    const tempFile = await Deno.makeTempFile();
    try {
      await Deno.writeTextFile(tempFile, "Hello, world! This is plain text.");
      assertEquals(await hasNullBytes(tempFile), false);
    } finally {
      await Deno.remove(tempFile);
    }
  });

  await t.step("returns true for binary content", async () => {
    const tempFile = await Deno.makeTempFile();
    try {
      const binaryData = new Uint8Array([72, 101, 108, 0, 111]); // "Hel\0o"
      await Deno.writeFile(tempFile, binaryData);
      assertEquals(await hasNullBytes(tempFile), true);
    } finally {
      await Deno.remove(tempFile);
    }
  });

  await t.step("returns false for empty file", async () => {
    const tempFile = await Deno.makeTempFile();
    try {
      await Deno.writeTextFile(tempFile, "");
      assertEquals(await hasNullBytes(tempFile), false);
    } finally {
      await Deno.remove(tempFile);
    }
  });

  await t.step("returns false for nonexistent file", async () => {
    assertEquals(
      await hasNullBytes("/tmp/nonexistent-scanner-test-file"),
      false,
    );
  });
});
