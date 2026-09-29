# Release script optimization - 2026-09-29

Scope: RELEASE.bat and RELEASE-PATCH.bat. No release invocation, version bump,
commit, push, or GitHub publication was performed during validation.

## Changes

- Shared release-build.cjs runs both read-only TypeScript checks concurrently,
  waits for both to finish, and starts Vite only when both succeed.
- Local Node CLI entry points replace npm/npx wrappers for checks, Vite and
  electron-builder. Missing dependencies fail instead of prompting a download.
- electron-builder uses --publish never; the existing explicit gh release step
  remains responsible for publication when the user runs the release BAT.
- Quick and standard artifacts share one hash pass and one baseline snapshot.
  The baseline advances only after both archives and manifests are written.
- ZIP entries come directly from package.json/out; no staging copy is needed
  for quick, standard or legacy PATCH archives. Paths inside ZIP are preserved.
- ZIP write failures now propagate; the former AdmZip.writeZip call could ignore
  a failed write without a callback. Retry waiting no longer busy-spins the CPU.
- Fixed process shutdown wait now polls until the named processes exit, with a
  two second safety ceiling; a normal shutdown can continue immediately.

## Verification

- node scripts/release-build.cjs: success on current 1.0.96 source.
  Node typecheck 1.1s; web typecheck 6.1s concurrently; Vite stage 5.3s.
  These are observed stage durations, not a before/after full-release benchmark.
- node --test scripts/release-artifacts.test.cjs: 3 passed in temporary fixtures.
  Covers unchanged/changed/deleted files, quick fromVersion, full standard file
  bytes, legacy PATCH layout, and baseline preservation on standard ZIP failure.
- Scoped git diff --check: passed.

## Limits

Installer and portable compression still run: their artifacts are still required
by these workflows. Compression level and TypeScript checks are not reduced.
End-to-end BAT execution was not used because it bumps version, stops apps,
prunes prior artifacts and can publish. Consequently total speedup is unmeasured.
Existing runtime workaround, broad process termination, automatic staging of
all Git changes and old-artifact retention behavior remain existing release
behavior; these were not silently redesigned in a speed optimization.
