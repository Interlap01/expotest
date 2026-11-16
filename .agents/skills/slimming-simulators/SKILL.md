---
name: slimming-simulators
description: Create, boot, shut down, clone, erase, delete and slim iOS simulators on a Mac with simslim, the simulator CLI MobAI ships, so automation and parallel runs fit in memory. Slimming turns off background daemons (Siri, Spotlight, photo analysis, iCloud, widgets) a simulator does not need, cutting its memory about 4x; `simslim on <udid> --app <path.app>` slims it to the services a built app uses and boots it. Use when asked to boot or start a simulator, run a built app on a simulator, make a fresh or clean simulator, clone one for parallel runs, reset or erase one, delete old ones, run many simulators at once, or when simulators use too much memory, the Mac swaps, "slim a simulator", "disable simulator background daemons", "simulator RAM". Also covers slimming the simulator in a CI workflow (the MobAI-App/mobai-ci action or mobai-ci sim boot), e.g. "slim the simulator in CI", "iOS CI is slow to start". macOS only.
---

# Managing and slimming iOS simulators

MobAI ships simslim, a CLI for this Mac's simulators. Boots wait for the
simulator to settle; clones are repaired and checked. macOS only, with Xcode
and an iOS Simulator runtime installed.

```sh
SIMSLIM="$HOME/Library/Application Support/mobai/bin/simslim"
```

MobAI puts it there when it starts. Use that copy, not a `simslim` on PATH:
a Homebrew simslim has no `--app` and no `create`. When it is missing, ask
the user to open MobAI; do not install simslim yourself. Errors go to stderr
as `simslim: <message>` with exit status 1.

## Lifecycle

```sh
"$SIMSLIM" list --json                      # [{udid, name, state, platform, osVersion, ...}]
"$SIMSLIM" create "iPhone 17 Pro" --json    # {udid, name, runtime}: the newest runtime that supports
                                            # the device type, unless --runtime names one; --name
"$SIMSLIM" boot <udid>                      # once booted (up to 2 min on a first boot)
"$SIMSLIM" shutdown <udid>
"$SIMSLIM" clone <udid> "Worker 2" --json   # {udid, ...}
"$SIMSLIM" erase <udid>                     # apps, data and settings gone
"$SIMSLIM" delete <udid>                    # the simulator is gone
```

`xcrun simctl list devicetypes` names the device types `create` accepts.
After a boot, MobAI picks the simulator up as a device within a few seconds;
claim it before driving it (`controlling-mobile-devices`).

Erase and delete cannot be undone. Only erase or delete simulators you
created in this task, or ones the user names; never "clean up" others.

## Slimming

A booted simulator runs about 180 background daemons that development and
testing never need. Slimming disables the ones in simslim's allowlist:
roughly 4.0 GB stock against 0.9 GB slim, so several times as many
simulators fit on one Mac. The setting lives in the simulator's own launchd
database, so later boots come up the same in one boot, and `off` reverses
it.

### Slimming to the app you run

When you boot a simulator to run an app you built, slim it with that app
instead of a plain `boot`. simslim reads the app's entitlements, Info.plist
usage descriptions, app extensions and linked frameworks, keeps the
categories they need, turns the rest off and boots the simulator:

```sh
"$SIMSLIM" on <udid> --app "$PWD/ios/build/Build/Products/Debug-iphonesimulator/Shelf.app"
# Keeping photos for photos: framework PhotosUI
# Done. Simulator reconfigured slim and booted.
```

- `--app` takes the built simulator `.app` folder you are about to install,
  for example the one a build command wrote under its `-derivedDataPath`. An
  `.ipa` is refused. Pass `--app` twice to keep what an app and its UI test
  runner use.
- The app must be built with code signing on: its entitlements (push,
  universal links, iCloud) reach the build only through signing. Xcode signs
  simulator builds this way by default, to run locally, with no Apple
  account. A build made with `CODE_SIGNING_ALLOWED=NO`, passed to the build or
  set in the project, is refused with `<App>.app is not signed`. Build it
  again without that flag. When the project turns signing off itself, sign
  from the command line instead of editing the project:

  ```sh
  xcodebuild ... CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build
  ```
- Each `Keeping` line names a category left on and what in the app needs it.
  "uses none of the services simslim manages" means everything is off.
- A booted simulator reboots only when the services change; otherwise it
  says `Already slim. Nothing to change.` After adding a capability such as
  push, StoreKit or HealthKit, rebuild and run `on --app` again.
- It only sees what the app declares or links. When a test reaches a
  service the app does not, such as opening a link in Safari (`web`), slim
  by category instead, keeping that category.
- Before iOS 18.5 a simulator cannot keep the setting and `on` refuses. Add
  `--no-reboot` to slim the running boot only (it is stock again at its next
  boot), or `boot` it as it is.

A plain `boot` changes nothing: a stock simulator boots stock and a slimmed
one boots slimmed.

### Slimming by category

```sh
"$SIMSLIM" status <udid> --json             # booted simulators only
"$SIMSLIM" on <udid>                        # every category off
"$SIMSLIM" on <udid> --except store,web     # keep whole categories
"$SIMSLIM" on <udid> --keep com.apple.apsd  # keep single daemons
"$SIMSLIM" off <udid>                       # back to stock
"$SIMSLIM" profiles                         # what each category turns off
```

`on` and `off` boot a shut-down simulator, writing the setting while it is
off, and reboot a booted one when something changes. Slim by category when
the user asks to slim a simulator, or to keep a service the app does not use.
`--app` cannot be combined with `--except`, `--keep` or `--profile`.

| Category | Keep it when the app needs |
|---|---|
| `store` | push notifications, StoreKit testing, App Store, media |
| `web` | universal links, associated domains, web push |
| `search` | Spotlight or in-Settings search |
| `pim` | Contacts, Calendar, Reminders, Mail pickers |
| `photos` | the photo library or photo picker with real content |
| `icloud` | iCloud sync, the Apple Account, iCloud Keychain |
| `health` | HealthKit, HomeKit, Fitness |
| `siri` | Siri, speech, on-device ML services |
| `widgets` | widgets, Live Activities, wallpaper |
| `messaging` | iMessage, FaceTime, calls |
| `connectivity` | AirDrop, Continuity, CarPlay, Watch, Find My |
| `family` | Family Sharing, Screen Time |
| `apps` | News, Weather, Maps, Tips, Game Center |
| `telemetry` | DeviceCheck, ad attribution, diagnostics and feedback |
| `mdm` | device management profiles and managed assets |
| `other` | Wallet and passes, App Clips, other background services |

Daemons that wedge a simulator when disabled are never touched, even with
`--keep` or `--except`.

## Slimming in CI

CI simulators boot stock, from the `MobAI-App/mobai-ci` action's
`boot-sim` or from `mobai-ci sim boot`. Add slimming to a workflow only when
the user asks for it. Suggest it, without adding it, when iOS runs are slow
to start, for example when the test runner waits minutes on a freshly booted
simulator, or when several simulators share one runner.

The exception is the `mobai-tests.yml` workflow App Builder commits: its iOS
job already slims, with `--slim auto` on `mobai-ci test`. Leave it as it is.

### Slimming from the built app

`--slim auto` reads the simulator `.app` given as `--app` the same way
`simslim on --app` does, keeps the categories the app uses and turns off the
rest. It slims the simulator that is already booted, before the app is
installed:

```sh
mobai-ci test tests --app "$APP_PATH" --device "$MOBAI_SIM_UDID" --slim auto
```

The log names each category kept and why, for example
`slim auto: keeping photos (framework PhotosUI)`. It needs a `.app` folder
(not an `.ipa`) and a simulator on the same Mac: it refuses `--cloud`,
`--mobai-addr` and `--discover`. Without the flag the simulator stays stock.

The app must be built signed, as above: the run fails with
`--slim auto: <App>.app is not signed` when the build passed
`CODE_SIGNING_ALLOWED=NO` or the project sets it. The workflow's own build
always signs. A `mobai.json` build command signs unless it turns signing off
(`CODE_SIGNING_ALLOWED=NO`, Flutter's `--no-codesign`) or the project does:
then fix that command, with the flags above when the project is the cause,
rather than dropping `--slim auto`.

It only sees what the app links or declares. When a test reaches a service
the app does not (for example opening a link in Safari, category `web`),
drop `--slim auto` and slim at boot with a profile that excepts it (below).

### Slimming at boot

To turn off only some services, use `sim-slim-only` with category ids from
the table above, or launchd labels, comma-separated. `widgets` is the usual
choice: on a small runner, a fresh simulator's widget and wallpaper
extensions are what keep the runner waiting.

```yaml
- uses: MobAI-App/mobai-ci@v1
  with:
    boot-sim: true
    sim-slim-only: widgets
```

To slim everything except what the tests use, commit a simslim profile and
point `sim-slim` at it. `except` and `keep` work like `simslim on`'s flags:

```json
{ "name": "ci", "except": ["store", "web"] }
```

```yaml
- uses: actions/checkout@v7          # the path is relative to the checkout
- uses: MobAI-App/mobai-ci@v1
  with:
    boot-sim: true
    sim-slim: ci/slim.json
```

- A workflow that runs mobai-ci directly passes the same values as
  `mobai-ci sim boot --slim-only widgets` or `--slim ci/slim.json`.
- `sim-slim` and `sim-slim-only` cannot be combined.
- Editing the profile keeps the simulator cache, and the next run applies
  the new profile.
- Android emulators have nothing to slim; leave Android jobs as they are.

## Typical flows

**Running an app you built:** `"$SIMSLIM" on <udid> --app <the .app>`, then
install the same `.app`.

**A clean simulator for a test run:** `create` it, `on --app` with the built
app, run, then `delete` it when the run is done.

**Parallel workers:** `on --app` one simulator, install the app, then
`clone` it once per worker; clones keep the slim setting and the installed
app.

**Back to stock** before testing anything that touches a slimmed feature:
`"$SIMSLIM" off <udid>`, or erase the simulator.

## Do not

- Do not disable daemons by hand with `xcrun simctl spawn launchctl`; the
  allowlist exists to avoid the ones that wedge a simulator.
- Do not boot many simulators at once on a small Mac without asking; each
  stock simulator takes about 4 GB.
- Do not delete or erase a simulator you did not create unless the user
  names it.
- Do not install simslim (Homebrew or otherwise); MobAI ships it.
