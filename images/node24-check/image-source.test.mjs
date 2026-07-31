import { deepStrictEqual, match, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";

import { prepareImageBuildContext } from "./prepare-context.mjs";
import { prepareWrapperIntegrationFixture } from "./prepare-integration-fixture.mjs";

const directories = [];
const imageDirectory = new URL("./", import.meta.url);

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => {
      await chmod(join(path, "fixture", "workspace"), 0o755).catch(() => undefined);
      await rm(path, { force: true, recursive: true });
    }),
  );
});

describe("Eden Node 24 image source", () => {
  test("pins the approved multi-platform distroless base and closed config", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", imageDirectory), "utf8");
    match(
      dockerfile,
      /^FROM gcr\.io\/distroless\/nodejs24-debian13@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212$/mu,
    );
    match(dockerfile, /^ARG SOURCE_DATE_EPOCH=0$/mu);
    match(dockerfile, /^USER 65532:65532$/mu);
    match(dockerfile, /^WORKDIR \/workspace$/mu);
    match(dockerfile, /^ENTRYPOINT \["\/nodejs\/bin\/node","\/opt\/eden\/wrapper\.mjs"\]$/mu);
    strictEqual(/^(?:CMD|SHELL|EXPOSE|ADD)\b/mu.test(dockerfile), false);
    const runLines = dockerfile.split("\n").filter((line) => line.startsWith("RUN "));
    strictEqual(runLines.length, 1);
    deepStrictEqual(JSON.parse(runLines[0].slice(4)), [
      "/nodejs/bin/node",
      "-e",
      "require('node:fs').mkdirSync('/usr/local/bin',{recursive:true});require('node:fs').symlinkSync('/nodejs/bin/node','/usr/local/bin/node')",
    ]);

    const manifest = JSON.parse(
      await readFile(new URL("base-manifest.json", imageDirectory), "utf8"),
    );
    deepStrictEqual(manifest.baseImage, {
      configs: [
        {
          digest: "sha256:952899fca64fb2f9495815ef4f82b124c49549d25de86f3a2d61acded14b7e1c",
          platform: "linux/amd64",
        },
        {
          digest: "sha256:6478a947c658f8f17bdbd8c3b600f916c2700e4a138850337fa098134a05e633",
          platform: "linux/arm64",
        },
      ],
      imageIndexDigest: "sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212",
      platformManifests: [
        {
          digest: "sha256:b1386d556b478c420927eb212236bfb31be9834a4549850a060a6351f7fff514",
          platform: "linux/amd64",
        },
        {
          digest: "sha256:c6465a8fcd268010c53e6e33e58d479dd232aa34f2312500afad8f605caffdc3",
          platform: "linux/arm64",
        },
      ],
      reference: "gcr.io/distroless/nodejs24-debian13:nonroot",
    });
    deepStrictEqual(manifest.container, {
      entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
      nodeAlias: {
        path: "/usr/local/bin/node",
        target: "/nodejs/bin/node",
      },
      user: "65532:65532",
      workingDirectory: "/workspace",
      wrapperPath: "/opt/eden/wrapper.mjs",
    });
    strictEqual(manifest.manifestVersion, 1);
    strictEqual(manifest.wrapper.protocolVersion, 1);
    const wrapper = await readFile(new URL("wrapper.mjs", imageDirectory));
    strictEqual(
      manifest.wrapper.contentHash,
      `sha256:${createHash("sha256").update(wrapper).digest("hex")}`,
    );
  });

  test("prepares a minimal context while the image layer owns the executable alias", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-image-context-test-"));
    directories.push(root);
    const destination = join(root, "context");
    await prepareImageBuildContext(destination);
    deepStrictEqual((await readdir(destination)).sort(), ["Dockerfile", "wrapper.mjs"]);
    strictEqual((await lstat(join(destination, "wrapper.mjs"))).isFile(), true);
  });

  test("prepares one non-secret read-only workspace fixture and writable result file", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-image-fixture-test-"));
    directories.push(root);
    const paths = await prepareWrapperIntegrationFixture(join(root, "fixture"));
    strictEqual((await stat(paths.workspace)).mode & 0o777, 0o555);
    strictEqual((await stat(join(paths.workspace, "check.mjs"))).mode & 0o777, 0o444);
    strictEqual((await stat(paths.control)).mode & 0o777, 0o444);
    strictEqual((await stat(paths.result)).mode & 0o777, 0o666);
    const control = JSON.parse(await readFile(paths.control, "utf8"));
    strictEqual(control.process.executable, "/usr/local/bin/node");
    strictEqual(control.process.cwd, ".");
    deepStrictEqual(control.process.arguments, ["check.mjs"]);
  });

  test("records the isolated fixture and exact verified publication without broader authority", async () => {
    const evidence = JSON.parse(
      await readFile(
        new URL(
          "../../docs/benchmark-results/2026-07-30-r2-docker-slice3-linux-x64.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    strictEqual(evidence.status, "published-verified-local-manifest-uncommitted");
    strictEqual(evidence.reproducibleOciCandidate.byteIdentical, true);
    strictEqual(
      evidence.reproducibleOciCandidate.imageIndexDigest,
      "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    );
    strictEqual(evidence.independentExecutionBackend.kind, "ephemeral-userns-remap-daemon");
    strictEqual(evidence.independentExecutionBackend.containerdSnapshotter, false);
    strictEqual(evidence.independentExecutionBackend.daemonStopped, true);
    strictEqual(evidence.independentExecutionBackend.temporaryStateRemoved, true);
    deepStrictEqual(evidence.independentExecutionBackend.securityOptions, [
      "name=seccomp,profile=builtin",
      "name=userns",
      "name=cgroupns",
    ]);
    strictEqual(evidence.realImageFixture.status, "passed");
    strictEqual(evidence.realImageFixture.blocker, null);
    strictEqual(evidence.realImageFixture.userNamespaceProbe.status, "passed");
    strictEqual(
      evidence.realImageFixture.userNamespaceProbe.backendHostNamespace ===
        evidence.realImageFixture.userNamespaceProbe.containerNamespace,
      false,
    );
    strictEqual(evidence.realImageFixture.userNamespaceProbe.uidMap, "0 100000 65536");
    strictEqual(
      evidence.realImageFixture.userNamespaceProbe.effectiveCapabilities,
      "0000000000000000",
    );
    strictEqual(evidence.realImageFixture.userNamespaceProbe.noNewPrivileges, true);
    strictEqual(evidence.realImageFixture.containerCreated, true);
    strictEqual(evidence.realImageFixture.repositoryCodeExecuted, true);
    strictEqual(evidence.realImageFixture.wrapperResult.outcome, "passed");
    strictEqual(evidence.realImageFixture.wrapperResult.stdout, "/wCACg==");
    strictEqual(evidence.realImageFixture.wrapperResult.stdoutByteLength, 4);
    strictEqual(evidence.realImageFixture.wrapperResult.stderrByteLength, 15);
    strictEqual(evidence.realImageFixture.cleanup.containerRemoved, true);
    strictEqual(evidence.realImageFixture.cleanup.stagingRemoved, true);
    strictEqual(evidence.realImageFixture.cleanup.remainingContainers, 0);
    strictEqual(evidence.publication.status, "published-verified");
    strictEqual(evidence.publication.repository, "ghcr.io/ai-eden/eden-node24-check");
    strictEqual(evidence.publication.tag, "eden-node24-check-v1");
    strictEqual(evidence.publication.visibility, "private");
    strictEqual(
      evidence.publication.imageIndexDigest,
      evidence.reproducibleOciCandidate.imageIndexDigest,
    );
    deepStrictEqual(evidence.publication.platforms, evidence.reproducibleOciCandidate.platforms);
    strictEqual(evidence.publication.rawIndexSha256Verified, true);
    strictEqual(evidence.applicationToolchainManifest.status, "written-local-uncommitted");
    strictEqual(evidence.authority.dockerExecution, "performed-local-probe-and-fixture-only");
    strictEqual(evidence.authority.imagePublication, "performed-authorized-exact-repository-only");
    strictEqual(evidence.authority.registryLogin, "performed-temporary-ghcr-only-and-removed");
    strictEqual(evidence.authority.registryPush, "performed-exact-repository-and-tag-only");
    strictEqual(evidence.authority.commit, "not-run");
    strictEqual(evidence.authority.push, "not-run");
  });
});
