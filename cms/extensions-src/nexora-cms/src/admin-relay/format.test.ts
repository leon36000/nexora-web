import { describe, expect, test } from "bun:test";
import { dollarsToMicro, microToCad, microToInput } from "./format";

describe("montants", () => {
  test("dollars -> micro-CAD, sans virgule flottante", () => {
    expect(dollarsToMicro("0,5")).toBe("500000");
    expect(dollarsToMicro("12.25")).toBe("12250000");
    expect(dollarsToMicro("0,000001")).toBe("1");
    expect(dollarsToMicro("1,2345678")).toBeNull();
    expect(dollarsToMicro("-1")).toBeNull();
    expect(dollarsToMicro("abc")).toBeNull();
  });
  test("micro-CAD -> CAD avec 4 décimales au plus", () => {
    expect(microToCad("500000")).toBe("0,5 $");
    expect(microToCad("1234567")).toBe("1,2345 $");
    expect(microToCad("0")).toBe("0 $");
    expect(microToCad("42")).toBe("0 $");
    expect(microToCad(null)).toBe("—");
    expect(microToInput("2000000")).toBe("2");
  });
});
