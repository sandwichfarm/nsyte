import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { spy, stub, restore } from "std/testing/mock.ts";
import {
  generateKeyPair,
  parseBunkerUrl,
  getTagValue,
  createNip46ClientFromUrl,
  connectToRelay,
  fetchFileEvents,
  listRemoteFiles,
  createpublishNsiteEvent,
  createProfileEvent,
  createRelayListEvent,
  createServerListEvent,
  createDeleteEvent,
  publishEventsToRelays,
  purgeRemoteFiles,
  NSITE_KIND,
  USER_BLOSSOM_SERVER_LIST_KIND,
  type NostrEvent,
  type Profile,
  type FileEntry
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
    const url = "bunker://pubkey123?relay=wss://relay.example.com&secret=mysecret";
    const result = parseBunkerUrl(url);
    
    assertEquals(result.pubkey, "pubkey123");
    assertEquals(result.relays, ["wss://relay.example.com"]);
    assertEquals(result.secret, "mysecret");
  });

  await t.step("should parse bunker URL with multiple relays", () => {
    const url = "bunker://pubkey456?relay=wss://relay1.com&relay=wss://relay2.com";
    const result = parseBunkerUrl(url);
    
    assertEquals(result.pubkey, "pubkey456");
    assertEquals(result.relays, ["wss://relay1.com", "wss://relay2.com"]);
    assertEquals(result.secret, undefined);
  });

  await t.step("should parse bunker URL without secret", () => {
    const url = "bunker://pubkey789?relay=wss://relay.com";
    const result = parseBunkerUrl(url);
    
    assertEquals(result.pubkey, "pubkey789");
    assertEquals(result.relays, ["wss://relay.com"]);
    assertEquals(result.secret, undefined);
  });

  await t.step("should throw on invalid bunker URL format", () => {
    const invalidUrls = [
      "https://example.com",
      "bunker://",
      "invalid://pubkey",
      ""
    ];
    
    for (const url of invalidUrls) {
      try {
        parseBunkerUrl(url);
        throw new Error(`Should have thrown for URL: ${url}`);
      } catch (error) {
        assertEquals(error.message.includes("Invalid bunker URL format"), true);
      }
    }
  });
});

Deno.test("Nostr Library - getTagValue", async (t) => {
  await t.step("should extract tag value from event", () => {
    const event: NostrEvent = {
      id: "event123",
      pubkey: "pubkey123",
      created_at: 1234567890,
      kind: 1,
      tags: [
        ["p", "pubkey456"],
        ["e", "event456"],
        ["d", "identifier123"]
      ],
      content: "test content",
      sig: "signature"
    };
    
    assertEquals(getTagValue(event, "p"), "pubkey456");
    assertEquals(getTagValue(event, "e"), "event456");
    assertEquals(getTagValue(event, "d"), "identifier123");
  });

  await t.step("should return undefined for missing tag", () => {
    const event: NostrEvent = {
      id: "event123",
      pubkey: "pubkey123",
      created_at: 1234567890,
      kind: 1,
      tags: [["p", "pubkey456"]],
      content: "test content",
      sig: "signature"
    };
    
    assertEquals(getTagValue(event, "missing"), undefined);
  });

  await t.step("should handle empty tags", () => {
    const event: NostrEvent = {
      id: "event123",
      pubkey: "pubkey123",
      created_at: 1234567890,
      kind: 1,
      tags: [],
      content: "test content",
      sig: "signature"
    };
    
    assertEquals(getTagValue(event, "any"), undefined);
  });
});

Deno.test("Nostr Library - createNip46ClientFromUrl", async (t) => {
  await t.step("should create client from valid bunker URL", async () => {
    const mockSigner = {
      getPublicKey: () => Promise.resolve("pubkey123")
    };
    
    // Mock NostrConnectSigner
    const NostrConnectSignerModule = await import("applesauce-signers");
    const fromBunkerURIStub = stub(
      NostrConnectSignerModule.NostrConnectSigner,
      "fromBunkerURI",
      () => Promise.resolve(mockSigner)
    );

    try {
      const result = await createNip46ClientFromUrl("bunker://test");
      
      assertEquals(result.client, mockSigner);
      assertEquals(result.userPubkey, "pubkey123");
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
      () => Promise.reject(new Error("Connection failed"))
    );

    try {
      await assertRejects(
        async () => await createNip46ClientFromUrl("bunker://test"),
        Error,
        "Failed to connect to bunker: Connection failed"
      );
      
    } finally {
      restore();
    }
  });
});

Deno.test("Nostr Library - connectToRelay", async (t) => {
  await t.step("should connect and perform operation successfully", async () => {
    const mockResult = { success: true };
    let capturedOperation: ((socket: WebSocket) => Promise<any>) | null = null;
    
    // Mock WebSocket
    const mockSocket = {
      close: () => {},
      onopen: null as any,
      onerror: null as any,
      onclose: null as any
    };
    
    const WebSocketStub = stub(
      globalThis,
      "WebSocket",
      function(url: string) {
        // Simulate successful connection
        setTimeout(() => {
          if (mockSocket.onopen) {
            mockSocket.onopen();
          }
        }, 10);
        return mockSocket as any;
      }
    );

    try {
      const operation = async (socket: WebSocket) => {
        return mockResult;
      };
      
      const result = await connectToRelay("wss://relay.test", operation, { timeout: 1000, retries: 0 });
      
      assertEquals(result, mockResult);
      assertEquals(WebSocketStub.calls.length, 1);
      assertEquals(WebSocketStub.calls[0].args[0], "wss://relay.test");
      
    } finally {
      restore();
    }
  });

  await t.step("should handle connection timeout", async () => {
    // Mock WebSocket that never connects
    const mockSocket = {
      close: () => {},
      onopen: null as any,
      onerror: null as any,
      onclose: null as any
    };
    
    const WebSocketStub = stub(
      globalThis,
      "WebSocket",
      function(url: string) {
        // Never trigger onopen
        return mockSocket as any;
      }
    );

    try {
      const operation = async (socket: WebSocket) => {
        return { success: true };
      };
      
      const result = await connectToRelay("wss://relay.test", operation, { timeout: 100, retries: 0 });
      
      assertEquals(result, null);
      
    } finally {
      restore();
    }
  });

  await t.step("should retry on failure", async () => {
    let attemptCount = 0;
    
    const mockSocket = {
      close: () => {},
      onopen: null as any,
      onerror: null as any,
      onclose: null as any
    };
    
    const WebSocketStub = stub(
      globalThis,
      "WebSocket",
      function(url: string) {
        attemptCount++;
        
        // Fail first attempt, succeed on retry
        if (attemptCount === 1) {
          setTimeout(() => {
            if (mockSocket.onerror) {
              mockSocket.onerror(new Event("error"));
            }
          }, 10);
        } else {
          setTimeout(() => {
            if (mockSocket.onopen) {
              mockSocket.onopen();
            }
          }, 10);
        }
        
        return mockSocket as any;
      }
    );

    try {
      const operation = async (socket: WebSocket) => {
        return { success: true };
      };
      
      const result = await connectToRelay("wss://relay.test", operation, { timeout: 1000, retries: 1 });
      
      assertEquals(result, { success: true });
      assertEquals(attemptCount, 2);
      
    } finally {
      restore();
    }
  });
});

Deno.test("Nostr Library - Event Creation Functions", async (t) => {
  const mockSigner = {
    signEvent: (template: any) => Promise.resolve({
      ...template,
      id: "signed_event_id",
      sig: "signature"
    })
  };

  await t.step("should create nsite event", async () => {
    const event = await createpublishNsiteEvent(
      mockSigner,
      "pubkey123",
      "path/to/file.txt",
      "sha256hash"
    );
    
    assertEquals(event.kind, NSITE_KIND);
    assertEquals(event.pubkey, "pubkey123");
    assertEquals(event.id, "signed_event_id");
    assertEquals(event.sig, "signature");
    assertExists(event.created_at);
    
    // Check tags
    const dTag = event.tags.find(t => t[0] === "d");
    const xTag = event.tags.find(t => t[0] === "x");
    const clientTag = event.tags.find(t => t[0] === "client");
    
    assertEquals(dTag?.[1], "/path/to/file.txt");
    assertEquals(xTag?.[1], "sha256hash");
    assertEquals(clientTag?.[1], "nsyte");
  });

  await t.step("should create profile event", async () => {
    const profile: Profile = {
      name: "Test User",
      about: "Test bio",
      picture: "https://example.com/pic.jpg",
      display_name: "Tester"
    };
    
    const event = await createProfileEvent(mockSigner, profile);
    
    assertEquals(event.kind, 0);
    assertEquals(event.content, JSON.stringify(profile));
    assertEquals(event.id, "signed_event_id");
    
    const clientTag = event.tags.find(t => t[0] === "client");
    assertEquals(clientTag?.[1], "nsyte");
  });

  await t.step("should create relay list event", async () => {
    const relays = ["wss://relay1.com", "wss://relay2.com"];
    
    const event = await createRelayListEvent(mockSigner, relays);
    
    assertEquals(event.kind, 10002);
    assertEquals(event.content, "");
    
    // Check relay tags
    const relayTags = event.tags.filter(t => t[0] === "r");
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
    const serverTags = event.tags.filter(t => t[0] === "server");
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
    const eTags = event.tags.filter(t => t[0] === "e");
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
      () => Promise.resolve([])
    );

    try {
      const files = await listRemoteFiles(["wss://relay.test"], "pubkey123");
      
      assertEquals(files, []);
      assertEquals(fetchFileEventsStub.calls.length, 1);
      
    } finally {
      restore();
    }
  });

  await t.step("should process file events and return unique files", async () => {
    const mockEvents: NostrEvent[] = [
      {
        id: "event1",
        pubkey: "pubkey123",
        created_at: 1000,
        kind: NSITE_KIND,
        tags: [
          ["d", "/file1.txt"],
          ["x", "hash1"]
        ],
        content: "",
        sig: "sig1"
      },
      {
        id: "event2",
        pubkey: "pubkey123",
        created_at: 2000,
        kind: NSITE_KIND,
        tags: [
          ["d", "/file1.txt"],  // Same file, newer
          ["x", "hash1_updated"]
        ],
        content: "",
        sig: "sig2"
      },
      {
        id: "event3",
        pubkey: "pubkey123",
        created_at: 1500,
        kind: NSITE_KIND,
        tags: [
          ["d", "/file2.txt"],
          ["sha256", "hash2"]  // Using sha256 tag
        ],
        content: "",
        sig: "sig3"
      }
    ];
    
    // Mock fetchFileEvents
    const fetchFileEventsStub = stub(
      await import("../../src/lib/nostr.ts"),
      "fetchFileEvents",
      () => Promise.resolve(mockEvents)
    );

    try {
      const files = await listRemoteFiles(["wss://relay.test"], "pubkey123");
      
      assertEquals(files.length, 2);
      
      // Should have newer version of file1
      const file1 = files.find(f => f.path === "/file1.txt");
      assertEquals(file1?.sha256, "hash1_updated");
      assertEquals(file1?.event?.id, "event2");
      
      // Should have file2
      const file2 = files.find(f => f.path === "/file2.txt");
      assertEquals(file2?.sha256, "hash2");
      assertEquals(file2?.event?.id, "event3");
      
      // Should be sorted by path
      assertEquals(files[0].path, "/file1.txt");
      assertEquals(files[1].path, "/file2.txt");
      
    } finally {
      restore();
    }
  });
});

Deno.test("Nostr Library - publishEventsToRelays", async (t) => {
  await t.step("should publish events to relays successfully", async () => {
    const mockEvents: NostrEvent[] = [
      {
        id: "event1",
        pubkey: "pubkey123",
        created_at: 1000,
        kind: 1,
        tags: [],
        content: "test",
        sig: "sig1"
      }
    ];
    
    const mockSigner = {};
    
    // Mock connectToRelay to succeed
    const connectToRelayStub = stub(
      await import("../../src/lib/nostr.ts"),
      "connectToRelay",
      async (relay: string, operation: any) => {
        // Simulate calling the operation
        const mockSocket = {
          send: spy(() => {})
        };
        return await operation(mockSocket);
      }
    );

    try {
      const result = await publishEventsToRelays(
        ["wss://relay1.test", "wss://relay2.test"],
        mockEvents,
        mockSigner as any
      );
      
      assertEquals(result, true);
      assertEquals(connectToRelayStub.calls.length, 2);
      
    } finally {
      restore();
    }
  });

  await t.step("should handle empty events array", async () => {
    const result = await publishEventsToRelays(
      ["wss://relay.test"],
      [],
      {} as any
    );
    
    assertEquals(result, false);
  });

  await t.step("should handle empty relays array", async () => {
    const mockEvents: NostrEvent[] = [
      {
        id: "event1",
        pubkey: "pubkey123",
        created_at: 1000,
        kind: 1,
        tags: [],
        content: "test",
        sig: "sig1"
      }
    ];
    
    const result = await publishEventsToRelays(
      [],
      mockEvents,
      {} as any
    );
    
    assertEquals(result, false);
  });
});

Deno.test("Nostr Library - purgeRemoteFiles", async (t) => {
  await t.step("should create and publish delete events", async () => {
    const mockFiles: FileEntry[] = [
      {
        path: "/file1.txt",
        sha256: "hash1",
        event: {
          id: "event1",
          pubkey: "pubkey123",
          created_at: 1000,
          kind: NSITE_KIND,
          tags: [],
          content: "",
          sig: "sig1"
        }
      },
      {
        path: "/file2.txt",
        sha256: "hash2",
        event: {
          id: "event2",
          pubkey: "pubkey123",
          created_at: 1000,
          kind: NSITE_KIND,
          tags: [],
          content: "",
          sig: "sig2"
        }
      }
    ];
    
    const mockSigner = {
      signEvent: (template: any) => Promise.resolve({
        ...template,
        id: "delete_event_id",
        sig: "delete_signature"
      })
    };
    
    // Mock publishEventsToRelays
    const publishEventsToRelaysStub = stub(
      await import("../../src/lib/nostr.ts"),
      "publishEventsToRelays",
      () => Promise.resolve(true)
    );

    try {
      const deletedCount = await purgeRemoteFiles(
        ["wss://relay.test"],
        mockFiles,
        mockSigner as any
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
      {} as any
    );
    
    assertEquals(deletedCount, 0);
  });

  await t.step("should handle files without events", async () => {
    const mockFiles: FileEntry[] = [
      {
        path: "/file1.txt",
        sha256: "hash1"
        // No event property
      }
    ];
    
    const deletedCount = await purgeRemoteFiles(
      ["wss://relay.test"],
      mockFiles,
      {} as any
    );
    
    assertEquals(deletedCount, 0);
  });
});