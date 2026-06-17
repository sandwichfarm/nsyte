// Import test setup FIRST to block all system access
import "../../test-setup-global.ts";

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { PERMISSIONS } from "../../../src/lib/nip46.ts";
import {
  NSITE_APP_LISTING_KIND,
  NSITE_RELEASE_NOTE_KIND,
} from "../../../src/lib/napp/listing.ts";

describe("NIP-46 PERMISSIONS — napp kinds", () => {
  it("authorizes signing kind 37348 (app listing)", () => {
    const has = PERMISSIONS.some((p) => p === `sign_event:${NSITE_APP_LISTING_KIND}`);
    assertEquals(has, true, `missing sign_event:${NSITE_APP_LISTING_KIND} in ${PERMISSIONS.join(",")}`);
  });

  it("authorizes signing kind 39108 (release note)", () => {
    const has = PERMISSIONS.some((p) => p === `sign_event:${NSITE_RELEASE_NOTE_KIND}`);
    assertEquals(has, true, `missing sign_event:${NSITE_RELEASE_NOTE_KIND} in ${PERMISSIONS.join(",")}`);
  });

  it("preserves pre-existing authorized kinds (no regression)", () => {
    assertEquals(
      PERMISSIONS.some((p) => p === "sign_event:35128"),
      true,
      "named-site manifest kind 35128 no longer authorized",
    );
    assertEquals(
      PERMISSIONS.some((p) => p === "sign_event:10002"),
      true,
      "relay-list kind 10002 no longer authorized",
    );
  });
});
