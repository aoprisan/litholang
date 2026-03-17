import { describe, it, expect } from "vitest";
import { formatDiagnostic, formatDiagnostics } from "../src/diagnostics.js";

describe("Diagnostics", () => {
  it("formats a diagnostic with source context", () => {
    const source = `define test(x: Number) -> Text as\n  return x + 1\nend`;
    const output = formatDiagnostic(source, "test.litho", {
      message: "Return type mismatch",
      position: { line: 2, column: 10 },
    });

    expect(output).toContain("Error: Return type mismatch");
    expect(output).toContain("--> test.litho:2:10");
    expect(output).toContain("return x + 1");
    expect(output).toContain("^");
  });

  it("formats multiple diagnostics", () => {
    const source = `line1\nline2\nline3`;
    const output = formatDiagnostics(source, "test.litho", [
      { message: "Error one", position: { line: 1, column: 1 } },
      { message: "Error two", position: { line: 3, column: 1 } },
    ]);

    expect(output).toContain("Error: Error one");
    expect(output).toContain("Error: Error two");
    expect(output).toContain("line1");
    expect(output).toContain("line3");
  });

  it("handles out-of-range line numbers gracefully", () => {
    const source = `single line`;
    const output = formatDiagnostic(source, "test.litho", {
      message: "Some error",
      position: { line: 99, column: 1 },
    });

    expect(output).toContain("Error: Some error");
    expect(output).toContain("--> test.litho:99:1");
  });
});
