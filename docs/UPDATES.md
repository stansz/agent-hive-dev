# How hive stays up to date

A hive release is made of pieces that each get their own updates and security fixes. This page is
what keeps them current, and how updates reach you.

## What's in a release

| Piece | What it is | Where its version comes from |
|---|---|---|
| libkrun | the library that boots each run's microVM | built from source at a pinned tag (`versions.json`) |
| libkrunfw | the Linux kernel inside the VM | upstream's prebuilt, pinned by version and checksum |
| pasta | network isolation for the VM | your distro's `passt` package; a pinned static build as a fallback |
| Node.js | runs hive itself | pinned, checked against nodejs.org's checksums |
| pi | the coding agent inside the VM | pinned in `image/Containerfile` |
| The VM filesystem | Fedora, Chromium, git, compilers inside the VM | Fedora's packages at the time it is built |
| npm packages | hive's server and web UI | `package-lock.json` |

Every pinned version lives in one place (`versions.json`, `image/Containerfile`,
`package-lock.json`), so a release can be rebuilt exactly and every change is a small diff.

## What happens automatically

- **Every day, a check looks for new upstream versions** of libkrun, libkrunfw, passt, Rust, the
  build image, Node.js and pi, and opens a pull request for each one. **Dependabot** does the same
  for npm packages and GitHub Actions, and opens security fixes as soon as an advisory is
  published.
- **Every change is tested on a real VM before it merges.** CI builds the whole release, boots it
  with KVM and checks HTTPS through the egress proxy, that the local network and cloud metadata
  addresses are refused, that headless Chromium loads a page, that DNS works, and that a run
  reaches the model API. An update's pull request is armed with GitHub's own auto-merge (the
  workflow only makes the enable call, since a bot may not merge its own work), so it merges as soon
  as the required checks pass; the maintainer only steps in when something fails (it stays open).
- **The VM filesystem is refreshed when it needs it:** the daily build checks the current one for
  pending Fedora updates and rebuilds it straight away for security fixes, or after 14 days for
  other updates. Otherwise it is reused, so you don't download 660 MB for nothing.
- **A nightly build comes out every day `main` changed:** a signed prerelease with everything that
  has passed so far.
- **GitHub's security checks** watch the code: Dependabot alerts, secret scanning with push
  protection, and private vulnerability reporting (the Security tab).

## How updates reach you

There are two channels:

| Channel | What you get | How |
|---|---|---|
| **stable** (the default) | releases the maintainer publishes by hand, after a nightly build has been used for a while | `hive update` |
| **nightly** | the daily signed prerelease: newest fixes first, tested by CI but not yet used much | `hive update --channel nightly` (`dev` and `beta` are aliases) |

`hive update` checks the release's signature before installing it (stable releases are signed
with a key that never leaves the maintainer's machine; nightly builds with a separate key that
stable installs never accept). `hive update --rollback` goes back one version, and
`hive update --channel stable` returns to the stable channel (it waits for the next stable release
rather than downgrading).

hive also tells you once a day, when you run it, if a newer release is out.

## What's yours to update

- **Your distro:** your normal system updates keep `passt`, `gh` and the kernel's KVM support current.
- **Windows:** the `agent-hive` WSL distro gets Ubuntu's automatic security updates while it runs;
  WSL itself updates through the Microsoft Store (`wsl --update`).

There is no release automation in this fork: no workflows, no signing keys, no nightly channel.
Build locally from source.
