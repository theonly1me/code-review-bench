import { expect, test } from "bun:test";
import { plainText } from "./plainText";

test("finding text keeps code characters and drops reviewer names, badges, and links", () => {
  expect(
    plainText(
      '<img alt="P1" src="https://example.com/p1.svg"> **Greptile** says `</style>` becomes `<\\/style>`; see `(a) => a.b`, `__dirname`, and `#private` <a href="#x">here</a>',
    ),
  ).toBe(
    "the reviewer says `</style>` becomes `<\\/style>`; see `(a) => a.b`, `__dirname`, and `#private` here",
  );
});
