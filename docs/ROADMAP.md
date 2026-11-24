# Roadmap

Decisions and next steps for the `hive` CLI. Each step ships on its own, tested on a real machine.
`main` is the one branch; the daily nightly prereleases carry the newest dependencies before
they're fully tested (see "Keeping it up to date").

## Step 1 — Releases, `hive update`, system libkrun *(done: v0.4.0)*

The first signed release, v0.4.0, is published and was tested end to end on a fresh home folder:
`install-cli.sh`, `hive setup`, `hive doctor`, a real run, `hive update --check` and `hive serve`.
The release workflow and its signing keys have since been removed from this fork; the notes below
are kept for reference.

- **Release build** *(removed from this fork)*: an app bundle containing `bin/hive`, a bundled
  Node, the `hive-vm` launcher and the CLI as one bundled file. The VM filesystem (rootfs) shipped
  as a separate download, and a `SHA256SUMS` file covered both.
- **`install-cli.sh`:** installs the latest release into
  `~/.local/share/agent-hive/versions/<version>`, links `~/.local/bin/hive`, then runs
  `hive setup`.
- **`hive setup`** downloads the rootfs if it's missing. **`hive doctor`** shows what's available.
- **`hive update`:**
  1. Checks the latest GitHub release.
  2. Verifies the signature and the checksums.
  3. Unpacks into a new version folder.
  4. Downloads the rootfs only when its version changed.
  5. Switches `current` in one step and keeps `previous`.
  
  `hive update --rollback` goes back to `previous`, and `--check` only reports. While installed,
  `hive` mentions a newer version at most once a day (`HIVE_NO_UPDATE_CHECK=1` turns that off).
- **libkrun and pasta come from the system** in this step (Fedora: the `libkrun` and `passt`
  packages).

## Step 1b — Windows through WSL2 *(done, in daily use on a real machine)*

WSL2 passes `/dev/kvm` through with nested virtualization (on by default on Windows 11), and the
release bundles libkrun and a static pasta, so any distro can host hive. Windows without KVM still
waits for step 3.

**1. Manual test first.** Done by hand on Windows 11 (WSL 2.6 after `wsl --update`, kernel
6.18.58.1-microsoft-standard-WSL2, Ubuntu 24.04) in a distro named `agent-hive`:

```powershell
wsl --update
wsl --install Ubuntu-24.04 --name agent-hive
```

```bash
ls -l /dev/kvm                       # crw-rw---- root kvm
sudo usermod -aG kvm $USER           # then wsl --shutdown from Windows
sudo apt install -y passt
curl -fsSL https://raw.githubusercontent.com/Old-GenS/agent-hive/main/install-cli.sh | sh
hive doctor && hive keys add openrouter
cd ~ && hive new wsl-test "a hello world web page in one HTML file"
hive serve                           # then http://127.0.0.1:8080/ui/ in the Windows browser
```

It worked: every `hive doctor` check passes (bundled libkrun, system pasta) and a real run works,
including the web UI. Problems hit, all fixed in the installer and `install-cli.sh`: a silent
multi-minute wait while the VM filesystem downloaded; `~/.local/bin` not on `PATH` until
`source ~/.profile`; the `kvm` group needed `sudo`; `gh` and `wslu` (for `wslview`) are not
installed by default.

Projects belong in the Linux home folder, not `/mnt/c` (much slower). `hive service install` needs
systemd in WSL; plain `hive serve` is enough, and `wslu`'s `wslview` opens the Windows browser.

**2. `install.ps1`, a one-line Windows installer** (the same pattern as Bun, Deno and uv) —
written, and in daily use on a real machine:

```powershell
irm https://raw.githubusercontent.com/Old-GenS/agent-hive/main/install.ps1 | iex
```

1. **WSL:** if missing, `wsl --install --no-distribution` (needs admin and a reboot; the script
   says so and asks to be run again afterwards).
2. **A dedicated `agent-hive` distro** from Ubuntu 24.04. It sits next to the user's own distros
   and never touches them; uninstalling is `wsl --unregister agent-hive`.
3. **Setup without the first-launch questions:** as root in the distro, create the user, add it
   to `kvm` and `sudo`, set its password over stdin, write systemd and the default user to
   `/etc/wsl.conf`, `apt-get install passt gh wslu git curl ca-certificates`, then run
   `install-cli.sh` as the user.
4. **`/dev/kvm`:** if missing, add `nestedVirtualization=true` under `[wsl2]` in
   `%UserProfile%\.wslconfig` (keeping a backup and the existing settings), `wsl --shutdown`, and
   check again; still missing means virtualization is off in the BIOS/UEFI, and the script says so.
5. **`hive` in PowerShell:** a `hive.cmd` on the Windows `PATH` that forwards to
   `wsl -d agent-hive -- hive ...`, so `hive serve` gives the web UI in the Windows browser.

CI parses the file with PowerShell 7 and Windows PowerShell 5.1 and runs PSScriptAnalyzer on it;
the real test is on a Windows machine. `docs/WINDOWS.md` is the user guide.

**3. Later, maybe: a ready-made WSL image.** Newer WSL installs a distro from a file
(`wsl --install --from-file`). An `agent-hive.wsl` image with Ubuntu, libkrun and hive already
inside would be one download with no package installs, but it is another large file to rebuild
for every security update, so only once the script has proven itself.

## Step 2 — Bundle libkrun and libkrunfw *(done: v0.5.0)*

This is what makes `hive` work beyond Fedora (Ubuntu, Debian, Mint, WSL2 with any distro).

- **Fedora's libkrun can't be copied into a bundle.** It links pipewire, virglrenderer, libepoxy
  and libdrm (GPU and sound features), and needs a new glibc.
- **libkrun is built from source** at a pinned tag and commit, with no GPU or sound features (the
  default build links only libc and libgcc). Upstream publishes no libkrun binaries.
- **libkrunfw (the guest kernel):** upstream's prebuilt `libkrunfw-x86_64.tgz` from
  github.com/containers/libkrunfw releases, checked against a pinned SHA-256. It's about 24 MB and
  depends on nothing, not even glibc.
- **Old-glibc builds, the manylinux way.** Native code built on a new distro refuses to load on an
  older one; even today's launcher, built on Fedora, needs glibc 2.38. So the launcher and libkrun
  are compiled in the `manylinux_2_28` container (glibc 2.28, pinned by digest), with a current GCC
  and a pinned Rust: they run on Ubuntu 20.04+, Debian 11+, RHEL/Alma/Rocky 8+, Mint, Fedora, Arch
  and WSL distros. This only sets the oldest glibc they ask for; at run time they use the user's
  own glibc, so its security fixes still come from the distro. The bundled Node.js uses the same
  baseline. `scripts/build-native.sh` does the build and refuses output that needs newer glibc
  symbols or unexpected libraries.
- **Hardened launcher:** built with `-fstack-protector-strong`, `_FORTIFY_SOURCE`, PIE and full
  RELRO, as distros build their packages.
- **pasta: the system package first.** `apt install passt`, `dnf install passt` or
  `pacman -S passt` keeps pasta on the distro's security updates, and on Ubuntu 24.04+ (and Mint
  22) the AppArmor profile that Ubuntu's `passt` package installs is what lets pasta create its
  user namespace. Distros without a package (Ubuntu 22.04, Debian 11, RHEL 8) get a static pasta
  bundled with the release instead; `src/pasta.ts` picks the system one when it runs, else the
  bundled one.
- **Bundle layout:** `lib/libkrun.so.1` and `lib/libkrunfw.so.5`; libkrun carries `RUNPATH=$ORIGIN`,
  so it finds libkrunfw next to itself without `LD_LIBRARY_PATH`. `libexec/hive-vm` is the launcher
  and `libexec/pasta` the static pasta fallback. Licenses go in `share/licenses/`.
- **Backend scan, in this order:**
  1. `HIVE_LIBKRUN` if set;
  2. system libkrun, so distro security updates apply, but only if the launcher's `--check`
     passes (every libkrun function hive uses is there and a context can be created), so an old
     distro libkrun falls through instead of breaking runs;
  3. bundled libkrun;
  4. (step 3) gVisor;
  5. otherwise stop with a clear message. Never fall back silently to plain containers.

  `hive doctor`, Settings › This computer and each run say which one was picked, e.g.
  `isolation: microvm (bundled libkrun)`.
- **One pin file, `versions.json`:** libkrun (tag, commit), libkrunfw (version, URL, SHA-256),
  passt (version, URL, SHA-256), the Rust toolchain, the build image digest and the bundled Node
  version. The release scripts read it, and the weekly update check (below) bumps it.
- **GPL source:** libkrunfw contains the Linux kernel (GPL-2.0) and pasta is built from the passt
  sources, so each release also uploads the corresponding source: libkrunfw's source at that tag,
  the kernel tarball its Makefile builds from, and the passt tarball the static pasta was built
  from.
- **Cost of this step:** whoever publishes releases has to rebuild them for libkrun security
  fixes, and the app download grows by about 15 MB (compressed). "Keeping it up to date" below
  automates that.
- **libkrunfw is pinned to 5.6.2,** the version Fedora ships: 5.6.4 boots but breaks DNS in the
  VM. A libkrun or libkrunfw bump needs a real run with DNS and HTTPS before it ships
  (`docs/RELEASING.md`).
- **Older pasta:** Ubuntu 24.04's pasta (February 2024) has no `--dns-host`; hive checks
  `pasta --help` and leaves it out, and that pasta then forwards to the host's first nameserver.
- **Testing so far:** the old-glibc build checks pass (libkrun needs glibc 2.28 at most, the
  launcher 2.17); on Fedora the bundled libkrun loads the bundled libkrunfw through `$ORIGIN` and
  boots a VM with working DNS and HTTPS; in an Ubuntu 24.04 container (Mint 22's userland, no system
  libkrun, Ubuntu's own pasta) `hive doctor` picks the bundled libkrun and a real run reaches the
  model API. Shipped in v0.5.0 and confirmed on a real Linux Mint 22.1 machine; CI now boots the
  bundle on GitHub's Ubuntu 24.04 runners for every change.

## Keeping it up to date

*Done.* The user-facing summary is [UPDATES.md](UPDATES.md); the maintainer details are in
[RELEASING.md](RELEASING.md). The design notes below stay for reference.

A release bundles or builds on pieces that each move on their own:

| Piece | Source | Changes |
|---|---|---|
| libkrun | built from source (step 2) | security fixes, a few times a year |
| libkrunfw (guest kernel) | upstream prebuilt | kernel fixes, more often |
| pasta | built from source, bundled as a fallback (step 2); the system package is preferred | pasta releases, distro updates |
| pi (in the VM image) | `PI_VERSION` in `image/Containerfile` | often |
| Fedora base, Chromium, node in the VM | `dnf` when the rootfs is built | weekly security updates |
| Bundled Node | release build | monthly |

How they stay current:

1. **One pin file.** Every version above is pinned in one file (`versions.json`), so a release is
   reproducible and a bump is a small change you can review. `image/Containerfile` and the release
   scripts read it.
2. **A daily check** *(done)*. `scripts/check-updates.mjs` in `bump.yml` looks for a new upstream
   release of each pinned piece and, when there is one, opens a pull request against `main` that
   bumps the pin (`scripts/rootfs-plan.mjs` decides whether the rootfs is rebuilt).
3. **CI on every bump** *(done)*. `ci.yml` runs `npm test`, then builds libkrun, the bundle and the
   rootfs on a runner with KVM and boots a real VM (`scripts/vm-smoke.mjs`). Every change reaches
   `main` as a pull request that GitHub's auto-merge merges once `test`, `vm` and
   `windows-installer` pass; there is no bypass, for anyone.
4. **The rootfs is reused while it is current** *(done)*. The daily nightly build reuses the tested
   rootfs unless `image/` changed, it has pending security updates, it is 14+ days old with
   updates, or it was dispatched with `fresh_rootfs`.
5. **Security fixes skip the wait** *(done)*. A libkrun, libkrunfw or Chromium security fix goes to
   `main` and gets a nightly prerelease the same night; a stable release is a manual bump from `main`.

### The nightly channel

- **One branch:** `main`, reached only through pull requests. Bump pull requests and Dependabot
  updates merge by GitHub's auto-merge once `test`, `vm` and `windows-installer` pass, so it's
  always the latest, but only CI-tested, not used in real work yet.
- **Nightly releases** *(done)*: every day with new commits, `nightly.yml` publishes a signed GitHub
  prerelease, `v<version>-nightly.<n>`, after a real VM smoke test. `hive update --channel nightly`
  follows them (`dev` and `beta` are accepted as aliases); the default channel follows only full
  releases. `hive doctor` shows the channel.
- **Stable releases:** cut by hand from `main` after a nightly build has run real tasks for a few
  days without trouble.
- **Rollback:** `hive update --rollback` works the same on both channels; going back to stable is
  `hive update --channel stable` (never a downgrade: it waits for the next stable release).
- **Setup:** see "Automation and the nightly channel" in [RELEASING.md](RELEASING.md) for the two
  signing keys, the ruleset and repository settings the automation needs, and how to rotate the
  prerelease key.

## Step 3 — gVisor fallback when there is no KVM

For VPSs without `/dev/kvm`, WSL without nested virtualization, some CI runners and PCs with
virtualization off in the firmware.

- **First, a spike:** rootless `runsc` inside the same network setup (so the agent still
  reaches the internet only through hive's egress proxy). The rest of this step depends on that
  combination working; if it doesn't, rethink before building the backend.

- `runsc` is one static Go binary, published upstream, so it's easy to bundle.
- It's a user-space kernel, not a VM, but still a strong boundary.
- It needs a CLI backend that starts pi with the same `work/` and `io/` shares (pi's session lives
  in `io/session`) and the same pasta network isolation. The file-based design (prompt in, event log out, patches back)
  stays the same.
- It needs testing on a machine without KVM.

## Later

- **`hive mcp`:** a stdio MCP server, so Claude Code, pi or other agents can hand tasks to hive.
- **`hive serve`** *(done)*: the HTTP server and web UI, a thin layer over the CLI's run engine
  (`src/web-runs.ts` over `src/runs.ts`), so web runs and `hive run` runs share one engine and one
  run list. `hive service install|status|restart|logs|uninstall` keeps it running as a systemd user
  unit (Linux) or a launchd agent (macOS).
- **macOS** *(plan: [MACOS.md](MACOS.md); build and install path done, signed release pending)*:
  - libkrun on Apple's Hypervisor.framework *(done)*;
  - a launcher build for Apple silicon (arm64), plus an arm64 ext4 image *(done:
    `scripts/build-native-macos.sh`, `scripts/build-release-macos.sh`)*;
  - network isolation without pasta (pasta is Linux-only): a vsock-only path to the egress proxy,
    so the VM has no IP network at all *(done; `npm run smoke:macos`)*;
  - code signing with the hypervisor entitlement: an ad-hoc signature (free) is enough to run it on
    your own Mac; a notarized download for other people needs an Apple Developer account (US$99/year)
    *(ad-hoc done; notarized release pending)*.
- **Packages:** `.rpm` and `.deb` for system updates; a signed `.pkg` or Homebrew on macOS.
- **Agent adapters:** one adapter per coding agent. Each starts its agent in the VM (pi today:
  `pi --mode json`) and turns its events into common ones (text, tool started or failed, usage,
  done) for `render.ts` and the cost totals, with session resume so `hive continue` works for it
  too.
- **Web search for the agent:** a search key passed like the LLM key (Tavily or Exa free tiers),
  or a keyless fallback; pi supports search through plug-in packages.
- **GUI onboarding** *(done)*: the first-run screens (welcome, the `hive doctor` checks with a
  rootfs download, adding a model key, GitHub). Design in `docs/GUI.md`.
- **Server restarts without stopping runs:** finished runs already survive restarts (they're run
  folders on disk), but a restart stops runs in progress (they're marked "interrupted"). Refuse to
  restart, or wait for them to finish.
- **Run settings in the web UI** *(done)*: Settings › Runs edits VM CPUs and memory, runs at
  once, the time limit, stall time and disk limit, checked against the computer and applied to new
  runs without a restart. Still open: a size per run.
- **Split `ui/src/main.ts`** (about 2,500 lines) into modules.
- **`hive serve` front end:** follow opencode's split (the agent as a local server, every UI a
  client over HTTP and server-sent events) and borrow OpenHands' UI patterns (action timeline,
  interrupt button, file-changes view). Notes and licenses in `docs/RESEARCH.md`.

### Workflow improvements

Roughly in order of value (from `docs/RESEARCH.md`):

1. **A cost or time limit per run,** e.g. "stop at $0.50". Token costs are already tracked.
2. **A per-run network allowlist:** the VM can reach only the LLM API and package registries.
3. **Automatic checks:** run the repo's tests in the VM after the agent finishes, and show pass or
   fail in the summary.
4. **The same task on two models side by side,** then pick the better diff.
5. **Notifications** to the desktop or phone when a run finishes.

## Isolation backends considered

When libkrun isn't available there are two different cases:

1. **KVM is there, libkrun isn't packaged** (Mint, Ubuntu, Debian, Ubuntu in WSL). The common case;
   step 2's bundled libkrun covers it completely. It isn't a backend question.
2. **No KVM at all.** Firecracker, Cloud Hypervisor and QEMU need KVM too (QEMU without it emulates
   the CPU and is far too slow for builds), which leaves gVisor or a plain container.

| Option | Needs KVM | Boundary | Bundling | Shared folders | Rootless networking | Platforms | Verdict |
|---|---|---|---|---|---|---|---|
| libkrun | yes (HVF on macOS) | hardware VM, own kernel | build from source | built in (virtiofs) | pasta on Linux, vsock to the proxy on macOS | Linux, macOS, WSL2 | main backend |
| gVisor (`runsc`) | no | user-space kernel: the agent's system calls never reach the host kernel directly | one static file | yes (bind mounts) | untested with pasta (step 3 spike) | Linux | fallback without KVM (step 3) |
| Container only (bubblewrap, rootless podman) | no | namespaces only: shares the host kernel, so one kernel bug is an escape | tiny / usually installed | yes | with pasta | Linux | at most an opt-in "reduced isolation" mode, never automatic |
| Firecracker | yes | hardware VM | one static file | no (disk images only) | needs TAP/root | Linux | would need a redesign |
| Cloud Hypervisor | yes | hardware VM | static files | needs virtiofsd | TAP or extras | Linux | more moving parts |
| QEMU | yes (unusably slow without) | hardware VM | large | via virtiofsd | built in | Linux, macOS, Windows | only if Windows without WSL is required |
| Cloud sandboxes (E2B, Modal, …) | — | provider's VMs | — | — | — | any | out of scope: code and key leave the machine, not a local app |

**Container-only mode:** Codex CLI and Claude Code's own sandbox use this model on Linux, and it's
available almost everywhere. But hive's promise is a real VM, so if it's ever added it's opt-in,
and `hive doctor`, the run output and the web UI always say "reduced isolation".

**macOS:** libkrun runs on Apple's Hypervisor.framework (Podman uses it there), so the same backend
carries over with a Mac launcher, an arm64 rootfs and a network setup without pasta: vsock to the
egress proxy, with TSI disabled. The full plan, phases and risks are in [MACOS.md](MACOS.md).
Apple's `container` tool (one small VM per container on Virtualization.framework) is worth watching
as an alternative. **Windows without WSL** would mean QEMU or Hyper-V; not worth it while WSL exists.

Networking: libkrun's built-in TSI networking gives the guest the host's network as it is, with
nothing blocked. A TAP device needs root plus firewall rules. pasta blocks this computer (its
loopback, gateway and own addresses) with no root, but not the rest of the LAN. LAN isolation comes
from hive's egress proxy (`src/egress.ts`, done): pasta forwards only the proxy's port, and the
proxy allows public addresses only, checked after resolving and connected by address. That's why
pasta plus the proxy is used; the per-run allowlist (item 2 under Later) then only needs an
allowlist inside that proxy.
