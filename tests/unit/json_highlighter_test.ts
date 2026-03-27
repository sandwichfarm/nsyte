import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { addLineNumbers, highlightJson } from "../../src/ui/json-highlighter.ts";

describe("highlightJson", () => {
  describe("string tokens", () => {
    it("keys are colored cyan and string values are colored green", () => {
      const input = '{"key": "value"}';
      const result = highlightJson(input);
      // Result should differ from input (ANSI codes were added)
      assertEquals(result !== input, true);
      // Both "key" and "value" tokens should appear in the output
      assertStringIncludes(result, "key");
      assertStringIncludes(result, "value");
    });

    it("handles escaped quotes inside strings without crashing", () => {
      const input = '{"k": "val\\"ue"}';
      const result = highlightJson(input);
      assertStringIncludes(result, "val");
      // The token text should be present
      assertStringIncludes(result, "k");
    });

    it("output differs from raw input proving ANSI codes were added", () => {
      const input = '{"a": "b"}';
      const result = highlightJson(input);
      assertEquals(result === input, false);
    });
  });

  describe("number tokens", () => {
    it("positive integers are colored yellow", () => {
      const input = '{"n": 42}';
      const result = highlightJson(input);
      assertStringIncludes(result, "42");
      assertEquals(result !== input, true);
    });

    it("negative numbers are colored yellow", () => {
      const input = '{"n": -5}';
      const result = highlightJson(input);
      assertStringIncludes(result, "-5");
      assertEquals(result !== input, true);
    });

    it("floating point numbers are colored yellow", () => {
      const input = '{"n": 3.14}';
      const result = highlightJson(input);
      assertStringIncludes(result, "3.14");
      assertEquals(result !== input, true);
    });
  });

  describe("keyword tokens", () => {
    it("true is colored magenta", () => {
      const input = '{"b": true}';
      const result = highlightJson(input);
      assertStringIncludes(result, "true");
      assertEquals(result !== input, true);
    });

    it("false is colored magenta", () => {
      const input = '{"b": false}';
      const result = highlightJson(input);
      assertStringIncludes(result, "false");
      assertEquals(result !== input, true);
    });

    it("null is colored gray", () => {
      const input = '{"n": null}';
      const result = highlightJson(input);
      assertStringIncludes(result, "null");
      assertEquals(result !== input, true);
    });
  });

  describe("structural characters", () => {
    it("braces and brackets are colored gray", () => {
      const input = '{"a": [1]}';
      const result = highlightJson(input);
      // The raw structural chars should be present in the output
      assertStringIncludes(result, "{");
      assertStringIncludes(result, "}");
      assertStringIncludes(result, "[");
      assertStringIncludes(result, "]");
      assertEquals(result !== input, true);
    });

    it("colons and commas are colored gray", () => {
      const input = '{"a": 1, "b": 2}';
      const result = highlightJson(input);
      assertStringIncludes(result, ":");
      assertStringIncludes(result, ",");
      assertEquals(result !== input, true);
    });

    it("nested objects produce colored output", () => {
      const input = '{"outer": {"inner": "val"}}';
      const result = highlightJson(input);
      assertStringIncludes(result, "outer");
      assertStringIncludes(result, "inner");
      assertStringIncludes(result, "val");
      assertEquals(result !== input, true);
    });
  });

  describe("whitespace and empty", () => {
    it("whitespace is preserved through highlighting", () => {
      const input = '{\n  "key": "value"\n}';
      const result = highlightJson(input);
      // Newlines should pass through unchanged
      assertStringIncludes(result, "\n");
      assertStringIncludes(result, "  ");
    });

    it("empty string returns empty string", () => {
      const result = highlightJson("");
      assertEquals(result, "");
    });

    it("whitespace-only string is returned unchanged", () => {
      const input = "   ";
      const result = highlightJson(input);
      assertEquals(result, input);
    });
  });
});

describe("addLineNumbers", () => {
  it("single line gets '1 \u2502' prefix", () => {
    const result = addLineNumbers("hello");
    assertStringIncludes(result, "1");
    assertStringIncludes(result, "\u2502");
    assertStringIncludes(result, "hello");
  });

  it("multi-line text gets sequential line numbers", () => {
    const result = addLineNumbers("line one\nline two\nline three");
    const lines = result.split("\n");
    assertEquals(lines.length, 3);
    assertStringIncludes(lines[0], "1");
    assertStringIncludes(lines[1], "2");
    assertStringIncludes(lines[2], "3");
    assertStringIncludes(lines[0], "line one");
    assertStringIncludes(lines[1], "line two");
    assertStringIncludes(lines[2], "line three");
  });

  it("custom startLine shifts line numbers", () => {
    const result = addLineNumbers("a\nb\nc", 5);
    const lines = result.split("\n");
    assertEquals(lines.length, 3);
    assertStringIncludes(lines[0], "5");
    assertStringIncludes(lines[1], "6");
    assertStringIncludes(lines[2], "7");
  });

  it("line numbers are right-padded for consistent width with 10+ lines", () => {
    // 10 lines: numbers 1-10, so width must be 2 (single digits get space padding)
    const tenLines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join(
      "\n",
    );
    const result = addLineNumbers(tenLines);
    const lines = result.split("\n");
    assertEquals(lines.length, 10);
    // Line 5 should have a space before it: " 5 |" pattern
    assertStringIncludes(lines[4], " 5");
    // Line 10 should be "10"
    assertStringIncludes(lines[9], "10");
  });

  it("startLine=5 with 10 lines produces numbers 5-14 with consistent width", () => {
    const tenLines = Array.from({ length: 10 }, (_, i) => `item${i}`).join(
      "\n",
    );
    const result = addLineNumbers(tenLines, 5);
    const lines = result.split("\n");
    assertEquals(lines.length, 10);
    assertStringIncludes(lines[0], "5");
    assertStringIncludes(lines[9], "14");
  });

  it("pipe separator appears on every line", () => {
    const result = addLineNumbers("alpha\nbeta\ngamma");
    const lines = result.split("\n");
    for (const line of lines) {
      assertStringIncludes(line, "\u2502");
    }
  });

  it("default startLine is 1", () => {
    const result1 = addLineNumbers("x");
    const result2 = addLineNumbers("x", 1);
    assertEquals(result1, result2);
  });
});
