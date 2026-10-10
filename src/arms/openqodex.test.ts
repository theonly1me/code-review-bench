import { expect, test } from "bun:test";
import { openqodexRunStatus } from "./openqodex";

test("an OpenQodex report whose reviewer stopped with an error is a failed review, not a review with no findings", () => {
  const report = {
    findings: [],
    outside_change: [],
    completion: { status: "incomplete", missing: ["the reviewer stopped with an error (success)"] },
  };

  expect(openqodexRunStatus(report)).toBe("failed");
});

test("a complete OpenQodex report is a done review", () => {
  expect(openqodexRunStatus({ findings: [], completion: { status: "complete" } })).toBe("done");
});

test("a missing OpenQodex report is a failed review", () => {
  expect(openqodexRunStatus(null)).toBe("failed");
});
