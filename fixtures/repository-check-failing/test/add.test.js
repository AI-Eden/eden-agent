import assert from "node:assert/strict";
import test from "node:test";

import { add } from "../src/add.js";

test("adds two integers", () => {
  console.log("RAW_REPOSITORY_OUTPUT_CANARY");
  assert.equal(add(19, 23), 42);
});
