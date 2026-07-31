import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";

import { decodeRepositoryToolchainManifest } from "@eden/contracts";

import {
  repositoryCheckToolchainConfigDigests,
  repositoryCheckToolchainManifest,
} from "../src/index.ts";

describe("application-owned repository-check toolchain manifest", () => {
  it("pins the reviewed published image and platform identities", () => {
    deepStrictEqual(decodeRepositoryToolchainManifest(repositoryCheckToolchainManifest), {
      ok: true,
      value: repositoryCheckToolchainManifest,
    });
    deepStrictEqual(repositoryCheckToolchainManifest.platforms, [
      {
        manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
        platform: "linux/amd64",
      },
      {
        manifestDigest: "sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230",
        platform: "linux/arm64",
      },
    ]);
  });

  it("pins the independently published config digest for each accepted platform", () => {
    deepStrictEqual(repositoryCheckToolchainConfigDigests, {
      "linux/amd64": "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
      "linux/arm64": "sha256:31b5c699e50ea674594f825c59f65c7b3f84d3f73ea0fdcd47a3cb4fb4b8566f",
    });
  });
});
