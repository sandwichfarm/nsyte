import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { restore, spy, stub } from "std/testing/mock.ts";
import {
  createDeleteEvent,
  createNip46ClientFromUrl,
  createNsiteEvent,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  type FileEntry,
  generateKeyPair,
  getTagValue,
  listRemoteFiles,
  type NostrEvent,
  NSITE_KIND,
  parseBunkerUrl,
  type Profile,
  publishEventsToRelays,
  purgeRemoteFiles,
  USER_BLOSSOM_SERVER_LIST_KIND,
} from "../../src/lib/nostr.ts";

Deno.test("Nostr Library - generateKeyPair", async (t) => {
  await t.step("should generate valid key pair", () => {
    const keyPair = generateKeyPair();

    assertExists(keyPair.privateKey);
    assertExists(keyPair.publicKey);

    // Check hex format (64 chars = 32 bytes)
    assertEquals(keyPair.privateKey.length, 64);
    assertEquals(keyPair.publicKey.length, 64);

    // Check hex characters
    const hexRegex = /^[0-9a-f]+$/;
    assertEquals(hexRegex.test(keyPair.privateKey), true);
    assertEquals(hexRegex.test(keyPair.publicKey), true);
  });

  await t.step("should generate unique key pairs", () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();

    // Keys should be different
    assertEquals(keyPair1.privateKey !== keyPair2.privateKey, true);
    assertEquals(keyPair1.publicKey !== keyPair2.publicKey, true);
  });
});

Deno.test("Nostr Library - parseBunkerUrl", async (t) => {
  await t.step("should parse valid bunker URL with relay and secret", () => {
    const url =
      "bunker://23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d?relay=wss://relay.example.com&secret=mysecret";
    const result = parseBunkerUrl(url);

    assertEquals(result.pubkey, "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d");
    assertEquals(result.relays, ["wss://relay.example.com"]);
    assertEquals(result.secret, "mysecret");
  });

  await t.step("should parse bunker URL with multiple relays", () => {
    const url =
      "bunker://e428a103934f42d877740eb926ea84a51ac9ce2bd1e344ae8924329814012179?relay=wss://relay1.com&relay=wss://relay2.com";
    const result = parseBunkerUrl(url);

    assertEquals(result.pubkey, "e428a103934f42d877740eb926ea84a51ac9ce2bd1e344ae8924329814012179");
    assertEquals(result.relays, ["wss://relay1.com", "wss://relay2.com"]);
    assertEquals(result.secret, undefined);
  });

  await t.step("should parse bunker URL without secret", () => {
    const url =
      "bunker://ad5308eb46a2194e0304d5fb3b8e1ded04541dba71bea36bda3906f7b9ca2b7f?relay=wss://relay.com";
    const result = parseBunkerUrl(url);

    assertEquals(result.pubkey, "ad5308eb46a2194e0304d5fb3b8e1ded04541dba71bea36bda3906f7b9ca2b7f");
    assertEquals(result.relays, ["wss://relay.com"]);
    assertEquals(result.secret, undefined);
  });
});

Deno.test("Nostr Library - createNip46ClientFromUrl", async (t) => {
  await t.step("should create client from valid bunker URL", async () => {
    const mockSigner = {
      getPublicKey: () =>
        Promise.resolve("23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d"),
    };

    // Mock NostrConnectSigner
    const NostrConnectSignerModule = await import("applesauce-signers");
    const fromBunkerURIStub = stub(
      NostrConnectSignerModule.NostrConnectSigner,
      "fromBunkerURI",
      () => Promise.resolve(mockSigner),
    );

    try {
      const result = await createNip46ClientFromUrl("bunker://test");

      assertEquals(result.client, mockSigner);
      assertEquals(
        result.userPubkey,
        "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
      );
      assertEquals(fromBunkerURIStub.calls.length, 1);
      assertEquals(fromBunkerURIStub.calls[0].args[0], "bunker://test");
    } finally {
      restore();
    }
  });

  await t.step("should handle connection errors", async () => {
    // Mock NostrConnectSigner to throw error
    const NostrConnectSignerModule = await import("applesauce-signers");
    const fromBunkerURIStub = stub(
      NostrConnectSignerModule.NostrConnectSigner,
      "fromBunkerURI",
      () => Promise.reject(new Error("Connection failed")),
    );

    try {
      await assertRejects(
        async () => await createNip46ClientFromUrl("bunker://test"),
        Error,
        "Failed to connect to bunker: Connection failed",
      );
    } finally {
      restore();
    }
  });
});

Deno.test("Nostr Library - Event Creation Functions", async (t) => {
  const mockSigner = {
    signEvent: (template: any) =>
      Promise.resolve({
        ...template,
        id: "signed_event_id",
        sig: "signature",
      }),
  };

  await t.step("should create nsite event", async () => {
    const event = await createNsiteEvent(
      mockSigner,
      "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
      "path/to/file.txt",
      "sha256hash",
    );

    assertEquals(event.kind, NSITE_KIND);
    assertEquals(event.pubkey, "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d");
    assertEquals(event.id, "signed_event_id");
    assertEquals(event.sig, "signature");
    assertExists(event.created_at);

    // Check tags
    const dTag = event.tags.find((t) => t[0] === "d");
    const xTag = event.tags.find((t) => t[0] === "x");
    const clientTag = event.tags.find((t) => t[0] === "client");

    assertEquals(dTag?.[1], "/path/to/file.txt");
    assertEquals(xTag?.[1], "sha256hash");
    assertEquals(clientTag?.[1], "nsyte");
  });

  await t.step("should create profile event", async () => {
    const profile: Profile = {
      name: "Test User",
      about: "Test bio",
      picture: "https://example.com/pic.jpg",
      display_name: "Tester",
    };

    const event = await createProfileEvent(mockSigner, profile);

    assertEquals(event.kind, 0);
    assertEquals(event.content, JSON.stringify(profile));
    assertEquals(event.id, "signed_event_id");

    const clientTag = event.tags.find((t) => t[0] === "client");
    assertEquals(clientTag?.[1], "nsyte");
  });

  await t.step("should create relay list event", async () => {
    const relays = ["wss://relay1.com", "wss://relay2.com"];

    const event = await createRelayListEvent(mockSigner, relays);

    assertEquals(event.kind, 10002);
    assertEquals(event.content, "");

    // Check relay tags
    const relayTags = event.tags.filter((t) => t[0] === "r");
    assertEquals(relayTags.length, 2);
    assertEquals(relayTags[0], ["r", "wss://relay1.com", "read", "write"]);
    assertEquals(relayTags[1], ["r", "wss://relay2.com", "read", "write"]);
  });

  await t.step("should create server list event", async () => {
    const servers = ["https://server1.com", "https://server2.com"];

    const event = await createServerListEvent(mockSigner, servers);

    assertEquals(event.kind, USER_BLOSSOM_SERVER_LIST_KIND);
    assertEquals(event.content, "");

    // Check server tags
    const serverTags = event.tags.filter((t) => t[0] === "server");
    assertEquals(serverTags.length, 2);
    assertEquals(serverTags[0], ["server", "https://server1.com"]);
    assertEquals(serverTags[1], ["server", "https://server2.com"]);
  });

  await t.step("should create delete event", async () => {
    const eventIds = ["event123", "event456"];

    const event = await createDeleteEvent(mockSigner, eventIds);

    assertEquals(event.kind, 5);
    assertEquals(event.content, "Deleted by nsyte-cli");

    // Check event tags
    const eTags = event.tags.filter((t) => t[0] === "e");
    assertEquals(eTags.length, 2);
    assertEquals(eTags[0], ["e", "event123"]);
    assertEquals(eTags[1], ["e", "event456"]);
  });
});

Deno.test("Nostr Library - listRemoteFiles", async (t) => {
  await t.step("should return empty array when no events found", async () => {
    // Mock fetchFileEvents to return empty array
    const fetchFileEventsStub = stub(
      await import("../../src/lib/nostr.ts"),
      "fetchFileEvents",
      () => Promise.resolve([]),
    );

    try {
      const files = await listRemoteFiles(
        ["wss://relay.test"],
        "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
      );

      assertEquals(files, []);
      assertEquals(fetchFileEventsStub.calls.length, 1);
    } finally {
      restore();
    }
  });

  await t.step(
    "should process file events and return unique files",
    async () => {
      const mockEvents: NostrEvent[] = [
        {
          id: "event1",
          pubkey: "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
          created_at: 1000,
          kind: NSITE_KIND,
          tags: [
            ["d", "/file1.txt"],
            ["x", "hash1"],
          ],
          content: "",
          sig: "sig1",
        },
        {
          id: "event2",
          pubkey: "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
          created_at: 2000,
          kind: NSITE_KIND,
          tags: [
            ["d", "/file1.txt"], // Same file, newer
            ["x", "hash1_updated"],
          ],
          content: "",
          sig: "sig2",
        },
        {
          id: "event3",
          pubkey: "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
          created_at: 1500,
          kind: NSITE_KIND,
          tags: [
            ["d", "/file2.txt"],
            ["x", "hash2"], // Using proper x tag
          ],
          content: "",
          sig: "sig3",
        },
      ];

      // Mock fetchFileEvents
      const fetchFileEventsStub = stub(
        await import("../../src/lib/nostr.ts"),
        "fetchFileEvents",
        () => Promise.resolve(mockEvents),
      );

      try {
        const files = await listRemoteFiles(
          ["wss://relay.test"],
          "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
        );

        assertEquals(files.length, 2);

        // Should have newer version of file1
        const file1 = files.find((f) => f.path === "/file1.txt");
        assertEquals(file1?.sha256, "hash1_updated");
        assertEquals(file1?.event?.id, "event2");

        // Should have file2
        const file2 = files.find((f) => f.path === "/file2.txt");
        assertEquals(file2?.sha256, "hash2");
        assertEquals(file2?.event?.id, "event3");

        // Should be sorted by path
        assertEquals(files[0].path, "/file1.txt");
        assertEquals(files[1].path, "/file2.txt");
      } finally {
        restore();
      }
    },
  );
});

Deno.test("Nostr Library - purgeRemoteFiles", async (t) => {
  await t.step("should create and publish delete events", async () => {
    const mockFiles: FileEntry[] = [
      {
        path: "/file1.txt",
        sha256: "hash1",
        event: {
          id: "event1",
          pubkey: "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
          created_at: 1000,
          kind: NSITE_KIND,
          tags: [],
          content: "",
          sig: "sig1",
        },
      },
      {
        path: "/file2.txt",
        sha256: "hash2",
        event: {
          id: "event2",
          pubkey: "23762f9bc85456db6badaaba49e33a640cc09856442b202c2df968cf0e96ff5d",
          created_at: 1000,
          kind: NSITE_KIND,
          tags: [],
          content: "",
          sig: "sig2",
        },
      },
    ];

    const mockSigner = {
      signEvent: (template: any) =>
        Promise.resolve({
          ...template,
          id: "delete_event_id",
          sig: "delete_signature",
        }),
    };

    // Mock publishEventsToRelays
    const publishEventsToRelaysStub = stub(
      await import("../../src/lib/nostr.ts"),
      "publishEventsToRelays",
      () => Promise.resolve(true),
    );

    try {
      const deletedCount = await purgeRemoteFiles(
        ["wss://relay.test"],
        mockFiles,
        mockSigner as any,
      );

      assertEquals(deletedCount, 2);
      assertEquals(publishEventsToRelaysStub.calls.length, 1);

      // Check the delete event was created correctly
      const publishedEvents = publishEventsToRelaysStub.calls[0].args[1];
      assertEquals(publishedEvents.length, 1);
      assertEquals(publishedEvents[0].kind, 5);
    } finally {
      restore();
    }
  });

  await t.step("should handle empty files array", async () => {
    const deletedCount = await purgeRemoteFiles(
      ["wss://relay.test"],
      [],
      {} as any,
    );

    assertEquals(deletedCount, 0);
  });

  await t.step("should handle files without events", async () => {
    const mockFiles: FileEntry[] = [
      {
        path: "/file1.txt",
        sha256: "hash1",
        // No event property
      },
    ];

    const deletedCount = await purgeRemoteFiles(
      ["wss://relay.test"],
      mockFiles,
      {} as any,
    );

    assertEquals(deletedCount, 0);
  });
});
