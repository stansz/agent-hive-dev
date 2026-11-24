# Agent Hive — AGENTS.md

## What this is

A tool that runs [pi](https://pi.dev) on a repo inside a throwaway microVM.

- **The main interface is the `hive` CLI** (`src/cli.ts`, `src/runs.ts`). It clones the current
  repo, or a remote with `--repo`, and boots a libkrun VM with `vm/hive-vm` under pasta (on
  Linux; on macOS the VM has no IP network and one vsock port to the egress proxy). The prompt
  goes in as a file, the agent's events come out as a log file, and its commits come back
  as patches. You then apply them, or push a branch and open a PR.
- **The same engine also runs behind an optional HTTP server** (`hive serve`: `src/index.ts`,
  `src/web-runs.ts`) with a REST API and a web UI at `/ui/`. There is one run engine
  (`src/runs.ts`); web runs and `hive run` runs share one run list. The separate
  [hive-mcp](https://github.com/stansz/hive-mcp) package no longer works with this server; a
  built-in `hive mcp` is planned.

## Working in this repo

- **This checkout is `stansz/agent-hive-dev`, a fork with nothing guarding it.** No ruleset, no
  required status checks, no CODEOWNERS, no CI, no release workflow. Commit on `main` and
  `git push origin main` — that is the whole process.
- **The upstream repo (`Old-GenS/agent-hive`) still has its own ruleset.** That is upstream's
  business, not ours. Don't push there.
- **Set `git config pull.ff only` once per clone** so a pull can only fast-forward.
- **Never rewrite history that is already pushed:** no force-push, no rebase or reset of published
  commits. That is the only rule worth keeping here, because it is the only one that loses work.

## Layout

| Path | What |
|------|------|
| `src/index.ts` | Fastify setup: public routes (the `/` and `/docs` redirects to `/ui/`, `/ui/`, `/health`) and the authenticated API scope |
| `src/config.ts` | All env-var config (the run limits also come from the settings file, Settings › Runs), provider table (`PROVIDERS`) |
| `src/keys.ts` | Provider keys in one private file (mode 600, atomic rename), masked display, lookup precedence (shell env > keys file > `.env`) and the key check per provider |
| `src/auth.ts` | Bearer tokens (`API_TOKEN` / `API_TOKENS`), one-time WebSocket tickets |
| `src/settings.ts` | The editable run settings (VM CPUs and memory, runs at once, time limit, stall time, disk limit, finished-run retention): the table with defaults and limits, `readSettings`, `validateSettings` against this computer, `applySettings`/`resetSetting` writing the keys file and updating `config` in place |
| `src/web-runs.ts` | The web UI's run routes over `src/runs.ts`: `/prompt` (new runs and follow-ups), `/runs`, `/status`, `/abort`, `/session` (delete), `/session/:id/kept` (star), `/sessions/clear` (delete finished runs in one go), `/pr`, `/issue`, `/export` (a run's result as a zip or git bundle), `/events` (WebSocket with replay); the run queue (`createSlots`); auto-push of a finished run's branch |
| `src/stall.ts` | Stall watchdog: stop a run when nothing in `work/` changed and no event arrived for `HIVE_STALL_MIN` minutes |
| `src/diskwatch.ts` | Disk watchdog: `du`-based size measurement and free-space checks that stop an agent step past `HIVE_RUN_DISK_MAX_GB` / below `HIVE_MIN_FREE_DISK_GB` |
| `src/vmcache.ts` | Per-repo VM cache buckets: the repo identity key, the bucket a run mounts at `/root/.cache`, the `.used` markers and pruning of old buckets |
| `src/openrouter.ts` | OpenRouter runs: pi's `models.json` from OpenRouter's model data, and a fixed provider order (maker first, then uptime, then price; low-precision endpoints skipped) |
| `src/sandbox.ts` | `pasta` + `hive-vm` wrapper for the libkrun microVM (the only backend); on macOS the same wrapper starts the VM directly with one vsock port to `src/vsock.ts`; the VM writes its events to a mounted `io/` folder that the host follows; `systemInfo()` for the UI |
| `src/vsock.ts` | The macOS host side of vsock-only egress: a short `/tmp/hv-*.sock` (0600) that the launcher maps one guest vsock port to, piping every connection to the egress proxy; started and closed by `runSandbox` |
| `src/egress.ts` | The egress proxy, the VM's only network path: pasta forwards its port to the host's loopback (or the vsock bridge does on macOS), and it resolves destinations itself and refuses non-public addresses (this computer, the local network) |
| `src/libkrun.ts` | Which libkrun the launcher loads: `HIVE_LIBKRUN`, then the system one when `hive-vm --check` passes, then the bundled one; the label every isolation report uses |
| `src/pasta.ts` | Which pasta each VM runs under: the system one when `pasta --version` works, else the static copy bundled in a release; the label every network-isolation report uses |
| `versions.json` | Pins the release's native pieces: libkrun (tag, commit), libkrunfw (version, x86_64 URL/SHA-256 and the macOS prebuilt and Linux arm64 assets), passt (version, URL, SHA-256), Rust, the manylinux build image digest and the bundled Node version |
| `install-cli.sh` | The Linux and macOS release installer: downloads the latest release over HTTPS, checks it against `SHA256SUMS` (with `shasum` on macOS), links `~/.local/bin/hive`, puts it on `PATH` (and says what to fix for KVM/pasta or Hypervisor.framework), downloads the VM rootfs or image with progress, and ends with `next: hive doctor` |
| `install.ps1` | The Windows one-line installer: a dedicated WSL2 Ubuntu distro with no first-launch prompts (user, password over stdin, `/etc/wsl.conf`), passt/gh/wslu, nested virtualization when `/dev/kvm` is missing, `install-cli.sh` as the user, and `hive.cmd` on the Windows `PATH`; `-Uninstall` / `HIVE_UNINSTALL=1` removes it |
| `src/git.ts` | Host-side git on the pristine clone only: clone, new-repo setup, `git am` the patches, push, change summary; `gh` helpers for the login, `gh repo create` and `gh pr create` |
| `src/github-login.ts` | GitHub device login for the server's `gh` (the UI's **Connect GitHub**): one login at a time, the one-time code read from gh's output, state and cancel; the output is never logged |
| `src/cli.ts` | `hive` CLI: argument parsing and command dispatch (run/new/continue/log/diff/apply/push/list/clean/keep/keys/login/serve/service/uninstall); sets the commit identity from the user's git config |
| `src/service.ts` | `hive service`: systemd user unit (Linux) or launchd agent (macOS) that runs `hive serve` at login/boot. Pure file builders (`systemdUnit`, `launchdPlist`, `servicePaths`), plus thin runners for `systemctl` / `launchctl`; tests set `HIVE_SERVICE_DIR` and never touch the real system |
| `src/uninstall.ts` | `hive uninstall`: `uninstallPlan` (a pure description of the app data dir, the `~/.local/bin/hive` symlink when it is ours, the caches, and optionally the runs and keys folders, with sizes) and `runUninstall` (the same plan as `would …` lines with `--dry-run`, else the real removal, refusing while a run is going and only ever deleting under the home or configured XDG/runs folders; a path it may not delete is reported with the exact command that finishes the job, and never stops the rest) |
| `src/runs.ts` | The run engine: run folders and `meta.json`; sources (your checkout, a URL, a new empty repo); agent steps in the VM (time note, stall watchdog, `finalStatus`); review cycles; follow-ups (`continueRun`); export of committed work whatever the outcome; downloadable results (`exportRun`: a zip of the files or a git bundle of the commits); push (a new branch, or updating the run's own branch after a follow-up; a new project creates its GitHub repo); `gh pr create`; starred runs (`setKept`, skipped by retention and Clear); startup cleanup (`recoverRuns`) and retention (`pruneRuns`) |
| `src/follow.ts` | Polls a JSONL file by byte offset (the VM's `io/events.jsonl`); opens it with `O_NOFOLLOW` |
| `src/render.ts` | Plain-text rendering of pi events plus token/cost totals |
| `src/routes/github.ts` | `gh`-backed repo list and branches for the UI, and the **Connect GitHub** device-login routes (`POST`/`GET`/`DELETE /api/github/login`) |
| `src/routes/providers.ts` | `/api/providers` and `/api/models` for the UI |
| `src/routes/system.ts` | `/api/system` (sandbox setup and checks) and `/api/system/usage` (live CPU, memory, disk, temperature, runs) for Settings › This computer |
| `src/usage.ts` | `usageNow()`: the live numbers behind the UI's Resources section, reading `/proc` and `/sys` under a configurable root |
| `src/routes/keys.ts` | `/api/keys`: list (masked), add (tested first), test, remove and make-default provider keys for Settings › API keys |
| `src/routes/settings.ts` | `/api/settings`: read the run settings and this computer, save a patch (400 field errors, 409 for env values), reset one setting to its default, for Settings › Runs |
| `src/models.ts` | Model lists per provider (OpenRouter's live list, cached 1 h) |
| `image/` | The sandbox image: pi (pinned `PI_VERSION`), `hive-agent` (runs pi), `hive-export` (format-patch), `hive-vm-init` (libkrun guest init), `hive-netd` (guest TCP → vsock relay, macOS) |
| `vm/` | libkrun backend: `hive-vm.c` (launcher), `build.sh` (ad-hoc signs on macOS), `hive-vm.entitlements`, `build-rootfs.sh` |
| `ui/` | Vite + vanilla TS web UI, built to `ui/dist`: `main.ts` (Runs: form, timeline, result; Settings: API keys, Runs, This computer), `bee.ts` (the run indicator), `util.ts` (`el()`, `esc()`, `api()`), `app.css` (light and dark tokens) |
| `scripts/` | `run-tests.mjs` (test runner with a throwaway `TMPDIR`), `ui-smoke.mjs` (headless browser check with a faked run), `build-native.sh` (libkrun, libkrunfw and the hardened launcher for Linux), `native-in-container.sh` (its manylinux_2_28 half), `build-native-macos.sh` (the macOS arm64 dylibs, launcher and signatures), `build-rootfs-image.sh` and `rootfs-image.mjs` (the macOS arm64 VM image and its naming), `macos-smoke.mjs` (real-VM isolation check on a Mac), `kernel-remote.mjs` (libkrunfw's kernel URL without GNU make) |
| `scripts/check-updates.mjs` | The daily bump check: newest upstream version of every pin in `versions.json` and `image/Containerfile` (`--list` as JSON, `--apply <component>`); pure parsers and `applyUpdate` are exported for tests |
| `scripts/rootfs-plan.mjs` | The nightly build's rootfs reuse decision (`decide()`): rebuild on a forced build, no previous rootfs, an `image/` tree change, pending security updates, or 14+ days old with updates; else reuse |
| `scripts/release-rootfs.mjs` | The rootfs checks shared by the release build and the release workflow: the tarball name, its `rootfs-info.json` rootfs id and `imageTree` must agree with the release's `image/` tree. It is also the one place release numbering lives: the next nightly previews the patch after the newest release (`nextNightlyVersion`), a stable release is the next patch (`nextStableVersion`), and the newest release is found by version, a stable release winning a tie with its own nightly (`newestRelease`, `compareVersions`); both workflows call it |
| `scripts/vm-smoke.mjs` | The real-VM release check: HTTPS through the egress proxy, LAN and metadata addresses refused, headless Chromium renders a page, and a run with a fake OpenRouter key gets a 401 and no network error |
| `scripts/ci-enable-kvm.sh` | Makes `/dev/kvm` usable and installs pasta on GitHub's Ubuntu runners |
| `scripts/macos-spike/` | The Phase 0 macOS harness: libkrun build recipe, throwaway launcher, vsock/egress bridge and guest probes; not used by the product build |
| `docs/INSTALL.md` | Every install route (Linux release, macOS source/release build, Windows, from source), what's needed, after installing, updating and uninstalling; the README keeps only the one-liners |
| `docs/WINDOWS.md` | The Windows/WSL2 guide: requirements, what `install.ps1` does, the env vars, `hive` from PowerShell versus inside WSL, where projects live, GitHub and the web UI, updating, uninstalling, troubleshooting and the manual install route |
| `docs/MACOS.md` | macOS: why the Linux network path doesn't carry over, the vsock-only egress design, the Phase 0/1/2/4 results, the remaining phases, the file map and the risks |

Build: `npm run build` (server), `npm run build:ui`, `npm run build:image`; for the libkrun
backend also `npm run build:vm` and `npm run build:rootfs`; on arm64 Linux, `npm run build:rootfs-image`
makes the macOS VM image. For release-grade Linux native builds (libkrun, libkrunfw and the
old-glibc launcher) use `scripts/build-native.sh`, which runs inside the pinned manylinux
container from `versions.json`. On Apple silicon, `scripts/build-native-macos.sh` builds and signs
the arm64 native pieces and `npm run smoke:macos` checks the real VM's isolation. Run the tests
with `npm test`.

## Security model — keep these invariants

1. **The sandbox gets nothing secret except one LLM key.** A VM shares only its own run's `work/`
   and `io/` (plus `out/` for export) and the shared VM cache, never the run folder itself (it
   holds `origin/`, which the host pushes from). Keys are passed with `-e NAME` from the child env, never
   on the command line. Don't add host mounts or env vars casually. A VM can have at most 5 shared
   folders (libkrun's interrupt slots); `runSandbox` refuses more. The libkrun backend maps no guest ports to the
   host. On Linux it runs in a pasta namespace that cannot reach the host's loopback, gateway or
   own addresses; on macOS the VM has no IP network at all, and its one vsock port leads only to a
   socket that pipes to the egress proxy. Its root is read-only with an in-RAM overlay.
2. **The host never runs git in `work/`.** The agent controls `work/.git` (hooks, config,
   filters, fsmonitor). Host git runs only in `origin/`, which no sandbox mounts, with hooks
   disabled. Changes cross over only as patch files applied with `git am`. Exports (`exportRun`,
   `hive export`, `GET /export`) are built like pushes: from `out/*.patch` applied in a fresh
   clone of `origin/` (or a local run's own repo), never from `work/`.
3. **Every API route lives inside the authenticated scope** in `index.ts`. Don't add path-based
   auth exceptions.
4. **Anything from GitHub or the agent is untrusted in the UI** — render with `esc()` only.
5. Repo URLs are restricted to github.com (`normalizeRepo`); `HIVE_ALLOW_ANY_REPO_URL=1` is for
   local testing only.
6. **The VM cache is shared between runs of the same repo only.** Each agent VM mounts
   `<HIVE_VM_CACHE>/repos/<cacheKey>` (default `~/.cache/agent-hive/vm-cache/repos/…`) at
   `/root/.cache`; the key comes from `src/vmcache.ts`, so runs of different repos never see each
   other's cache. It must never hold credentials or task data. The host-only `.used` markers live
   outside the buckets, and npm's cache lives inside (`NPM_CONFIG_CACHE=/root/.cache/npm`).
7. **The CLI's host git runs only in the user's repo** (rev-parse, status, clone source, apply/am
   of exported patches), never in a run's `work/`. Text crosses into and out of the VM only as
   files in `io/` and patches in `out/`.
8. **Everything the VM can write is handled through `src/vmfiles.ts`.** The `io/`, `io-export/`
   and `out/` folders are VM-writable, so the host reads them only through `readVmFile` /
   `readVmFileOrEmpty` (`O_NOFOLLOW`, `O_NONBLOCK`, a regular file only, size-capped) and writes
   them only through `writeVmFile` (delete the old name first, then create with `wx`); any other
   access filters with `lstatSync`. Host-only data — the base system prompt
   (`<run>/system-base.md`), `meta.json` — lives in the run folder, never in `io/`; patches are
   copied out of `out/` into a host-only folder before git reads them. The launcher log
   (`<run>/io.launcher.log`) sits outside the VM-writable `io/` folder for the same reason.
9. **Nothing reaches GitHub on the agent's say-so.** Branch pushes and new repos happen in the host
   after the run; pull requests and issues only when the user asks (`POST /pr/:id`, `/issue/:id`). `gh` and `git` run with
   argument arrays, never a shell.
10. **Provider keys are written only to the keys file** (`~/.config/agent-hive/env`, mode 600, atomic
    rename). They are never logged or returned whole (the UI and API only see a masked form), and a
    value is validated (`^[\x21-\x7E]{1,400}$`, no quotes, `#`, `\` or backticks) before it is
    written so it cannot inject another `NAME=value` line.
11. **A VM never outlives its time limit, and a crashed hive leaves no VM behind.** The launcher
    (`vm/hive-vm`) gets the time limit (`--timeout`) and stops the VM itself when it passes, even if
    the CLI or server died. Its owner check (`--watch-pid`) is used on macOS, where the launcher can
    see hive; under pasta it is not, because the launcher is in its own PID namespace. Instead, at
    start the server and the CLI run `recoverRuns()`: a run still marked running whose owner is gone
    has its leftover `hive-vm` stopped and is marked "interrupted". The stall watchdog stops a run
    that makes no progress for `HIVE_STALL_MIN` minutes.
12. **A run's disk use is bounded.** `src/diskwatch.ts` stops an agent step once the run folder plus
    its cache bucket passes `HIVE_RUN_DISK_MAX_GB` or the disk holding the runs has less than
    `HIVE_MIN_FREE_DISK_GB` free. It measures with `du` without following symlinks.
13. **The VM's only network path is hive's egress proxy** (`src/egress.ts`). pasta runs without
    `--config-net` and forwards a single port to the proxy on the host's loopback. On macOS there
    is no pasta: the launcher disables libkrun's implicit vsock device, maps one port to a short
    `/tmp/hv-*.sock` that only pipes to the proxy (`src/vsock.ts`), and the guest's `hive-netd` is
    the only forwarder. The proxy resolves each destination, allows public addresses only (checked
    after resolving and connected by address, so DNS rebinding cannot get around it) and carries
    HTTP/HTTPS only. `HIVE_NETWORK=direct` is the explicit opt-out, and only exists on Linux.

## GitHub access (server)

The `hive` CLI needs none of this: it uses the user's own git credentials and `gh` login on the host; nothing is passed into the VM.

Two setups, picked with `HIVE_GIT_PROTOCOL`:

- **`https` (default), a single box:** the server's `gh` login does everything: clone, push
  `hive/<id>` branches, list repos and branches, open pull requests, create new repos. Settings ›
  This computer shows which account it is. If the server is compromised, that account is exposed.
- **`ssh`, a VPS fleet:** per-repo deploy keys for clone and push, and a separate bot account's `gh`
  login for the rest:

| Account | Role | Auth | Scope |
|---------|------|------|-------|
| **<owner>** | Repo owner | SSH deploy keys (per repo, write access) | Only repos with a key installed |
| **<bot>** | Hive's bot account | `gh` CLI login | Repo list and branches, pull requests, new repos |

In the `ssh` setup a compromised server exposes the bot account and the per-repo deploy keys, not
full access to the owner's GitHub. The sandbox gets neither in either setup.

- **Your repos:** task with `repo=<owner>/<repo>` → host clones → agent works in the sandbox →
  host pushes `hive/<id>`. Open a PR from the UI's **Open pull request** button
  (`POST /pr/:id`, via `gh pr create`), or merge yourself.
- **External repos:** fork it yourself (for example with `gh repo fork`), then run the task on
  the fork.
- **New projects:** a task with `newRepo` starts from an empty repo; when the agent has commits,
  the host runs `gh repo create <login>/<name>` (private by default) and pushes to `main`. Needs a
  `gh` login that may create repos.

### Adding a repo

```bash
# on the server, as the user that runs agent-hive
ssh-keygen -t ed25519 -f ~/.ssh/<repo>_deploy -N ""
# from your machine (or repo Settings → Deploy keys → Allow write access)
gh repo deploy-key add - --repo <owner>/<repo> --title hive-$(date +%Y%m%d) --allow-write < <repo>_deploy.pub
# on the server: add  IdentityFile ~/.ssh/<repo>_deploy  to the Host github.com block in ~/.ssh/config
git ls-remote git@github.com:<owner>/<repo>.git   # test
```

### Commit author

Commits made in the sandbox use `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` from `.env` (default
`agent-hive`).

## Status

**Done, run engine (CLI and server alike):** runs on your checkout, a `--repo` URL or a new empty
repo; follow-ups in the same pi session (`hive continue`, also with no prompt: "continue where you
left off"); one automatic retry in the same session after a dropped model connection; review cycles with an optional second
model (`--review`, `--review-model`); a queue (`MAX_CONCURRENT_SESSIONS`); the stall watchdog, the
time limit and a deadline note to the agent; committed work kept on a timeout, stall, failure or
stop; success read from pi's last message (`stopReason`); startup cleanup of leftover VMs; finished
runs deleted after `HIVE_RUN_RETENTION_DAYS` (14); OpenRouter routing and `models.json`; the shared
VM cache (`~/.cache`, npm inside it); the Fedora VM image with headless Chromium and corepack.

**Done, CLI:** `run`, `new`, `continue`, `log`, `diff`, `apply`, `push` (a new branch, never
forced; updates the run's own branch after a follow-up), `push --pr`, `list`, `clean`, `keys`,
`serve`, `service` and `uninstall` (asks first; runs and saved keys/settings are kept unless you
say otherwise). Settings come from env vars or `~/.config/agent-hive/env`.

**Done, server and web UI:** `hive serve` over the same engine, so runs survive restarts and the web
run list shows CLI runs too. The new design (light and dark): Runs (new-run form with repo and
branch lists, per-provider model lists, review cycles, New project; the bee indicator, a timeline
with step check-offs, the result with commits, files, Open pull request and Post review as an
issue; follow-ups and a Continue button on failed or stopped runs; run management: star runs to
keep them, delete a finished run after a warning about unpushed commits, and Clear… finished runs
in one go) and Settings (API keys: Add, Test, Make default, Remove; Runs: VM CPUs and memory, runs
at once, time limit, stall time, disk limit and finished-run retention, saved to the keys file and
applied without a restart; This computer, with the checks, a live Resources section and
limits). First-run onboarding (`#setup`). Checked by
`scripts/ui-smoke.mjs`.

**Releases (automation removed in this fork):** `install.ps1` (the Windows one-line installer: a
dedicated WSL2 Ubuntu distro, `hive.cmd` on the Windows `PATH`, guide in `docs/WINDOWS.md`),
`install-cli.sh` (VM-filesystem download progress, KVM/pasta/PATH advice) and `hive update` with
rollback still exist. What is gone: every workflow, the nightly channel, Dependabot, the release
and signing scripts, `CODEOWNERS` and `docs/RELEASING.md`. There is no CI, and nothing checks a
signature unless you build and sign a bundle yourself.

**Not built yet:**
- server: refusing to restart, or finishing runs first, while runs are in progress
- `hive mcp` (stdio MCP for handing work to hive from other agents)
- a VM size per run
- macOS: Phases 0–2 are done and verified on an M4 (the arm64 image builds in CI, boots, and `hive setup` installs it as a `.img.gz`); Phase 3 has `npm test` green on macOS (run by the `macos` CI job) and a portable `du`; Phase 4's native build, darwin bundle, installer branch and isolation smoke test are done. Remaining: `/proc`-free recovery, the case-sensitive run image, and publishing/notarizing a signed macOS release
- a per-run network allowlist
