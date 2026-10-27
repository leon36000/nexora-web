import { expect, test } from "bun:test";
import { PAGE_TREE as SCHEMA_TREE } from "../../../../scripts/lib/schema";
import { PAGE_TREE } from "./constants";

test("la garde protège exactement les collections de pages déclarées dans le schéma", () => {
  expect([...PAGE_TREE].sort()).toEqual([...SCHEMA_TREE].sort());
});
