import type { RepositoryToolchainManifestV1 } from "@eden/contracts";

export const repositoryCheckToolchainImageRepository = "ghcr.io/ai-eden/eden-node24-check" as const;

export const repositoryCheckToolchainConfigDigests = {
  "linux/amd64": "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
  "linux/arm64": "sha256:31b5c699e50ea674594f825c59f65c7b3f84d3f73ea0fdcd47a3cb4fb4b8566f",
} as const;

export const repositoryCheckToolchainManifest = {
  imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
  manifestVersion: 1,
  nodeMajor: 24,
  paths: {
    control: "/run/eden/request.json",
    home: "/tmp/eden-home",
    nodeExecutable: "/usr/local/bin/node",
    result: "/run/eden/result.json",
    temporary: "/tmp",
    workspace: "/workspace",
    wrapper: "/opt/eden/wrapper.mjs",
  },
  platforms: [
    {
      manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
      platform: "linux/amd64",
    },
    {
      manifestDigest: "sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230",
      platform: "linux/arm64",
    },
  ],
  profileRevision: "r2-docker-profile-v1",
  toolchainId: "eden-node24-check-v1",
  wrapperContentHash: "sha256:0c669fe522a14c9afce051d98f57e373f9bb2b7fb0b5ef6fb2241b472a05a0c3",
  wrapperProtocolVersion: 1,
} satisfies RepositoryToolchainManifestV1;

export const repositoryCheckToolchainImageReference =
  `${repositoryCheckToolchainImageRepository}@${repositoryCheckToolchainManifest.imageIndexDigest}` as const;
