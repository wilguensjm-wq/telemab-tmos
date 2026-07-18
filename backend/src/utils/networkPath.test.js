import test from "node:test";
import assert from "node:assert/strict";
import { classifyAddressNetworkPath } from "./networkPath.js";

test("classifyAddressNetworkPath marks tailscale CGNAT range as tailnet", () => {
  assert.equal(classifyAddressNetworkPath("100.116.180.23"), "tailnet");
});

test("classifyAddressNetworkPath marks private ranges as lan", () => {
  assert.equal(classifyAddressNetworkPath("10.10.0.5"), "lan");
  assert.equal(classifyAddressNetworkPath("192.168.88.10"), "lan");
  assert.equal(classifyAddressNetworkPath("172.20.1.10"), "lan");
});

test("classifyAddressNetworkPath marks public IPv4 as public", () => {
  assert.equal(classifyAddressNetworkPath("8.8.8.8"), "public");
});

test("classifyAddressNetworkPath handles tailscale IPv6 range", () => {
  assert.equal(classifyAddressNetworkPath("fd7a:115c:a1e0::1"), "tailnet");
});