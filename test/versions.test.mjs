// The pinned versions used by the release build (versions.json), and the build scripts that the
// release runs. The pins are read by scripts/build-native.sh (through node) and
// scripts/build-release.sh, so a malformed one must fail here rather than during a release.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const versions = JSON.parse(readFileSync(join(repoRoot, "versions.json"), "utf8"));

test("versions.json has the expected pins", () => {
  assert.match(versions.libkrun.version, /^\d+\.\d+\.\d+$/);
  assert.match(versions.libkrun.commit, /^[0-9a-f]{40}$/);
  assert.equal(versions.libkrun.tag, `v${versions.libkrun.version}`);
  assert.match(versions.libkrun.repo, /^https:\/\/github\.com\/containers\/libkrun$/);

  assert.match(versions.libkrunfw.version, /^\d+\.\d+\.\d+$/);
  assert.ok(versions.libkrunfw.url.includes(`/v${versions.libkrunfw.version}/`), "libkrunfw.url matches its version");
  assert.ok(versions.libkrunfw.source.endsWith(`/v${versions.libkrunfw.version}.tar.gz`), "libkrunfw.source matches its version");
  assert.match(versions.libkrunfw.sha256, /^[0-9a-f]{64}$/);
  // GitHub redirects containers/libkrunfw to libkrun/libkrunfw, and release API URLs use the
  // destination host; accept both so a pin bump from the API does not fail this test.
  assert.match(versions.libkrunfw.url, /^https:\/\/github\.com\/(?:containers|libkrun)\/libkrunfw\//);
  assert.match(versions.libkrunfw.source, /^https:\/\/github\.com\/(?:containers|libkrun)\/libkrunfw\//);
  for (const [platform, asset] of [
    ["macos", "libkrunfw-prebuilt-aarch64.tgz"],
    ["linux", "libkrunfw-aarch64.tgz"],
  ]) {
    const pin = versions.libkrunfw[platform].aarch64;
    assert.equal(new URL(pin.url).pathname.split("/").pop(), asset, `libkrunfw.${platform} asset name`);
    assert.ok(pin.url.includes(`/v${versions.libkrunfw.version}/`), `libkrunfw.${platform} matches its version`);
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  }

  assert.match(versions.buildImage, /@sha256:[0-9a-f]{64}$/);
  assert.match(versions.rust, /^\d+\.\d+\.\d+$/);
  assert.match(versions.node, /^\d+\.\d+\.\d+$/);

  // The static pasta fallback is built from this source tarball.
  assert.match(versions.passt.sha256, /^[0-9a-f]{64}$/);
  assert.match(versions.passt.url, /^https:\/\/passt\.top\/passt\/snapshot\/passt-/);
  assert.ok(versions.passt.url.includes(versions.passt.version), "passt.url matches its version");
});

test("the release build scripts parse", () => {
  for (const script of [
    "scripts/build-native.sh",
    "scripts/native-in-container.sh",
    "scripts/build-native-macos.sh",
  ]) {
    const result = spawnSync("bash", ["-n", script], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }
});
