# Graph motion calibration: drag propagation and settling

Measured locally on 2026-11-16 against the running Obsidian 1.12.7 app, using
1,268 nodes and 2,245 links. The `obsidian` profile matches that app's current
force settings, which are **not the factory defaults**. This is a behavioral
calibration, not a claim of identical engines or a universal similarity score.

## Reference configuration

The live UI options were center strength `0.360201511335013`, repel strength
`10`, link strength `0.4677123883673`, and link distance `30`. The nonlinear
center/link controls resolve to approximately `0.042959061057050524` and
`0.07695316049124773` respectively. Charge is `-1000`; collision uses a uniform
radius of `60` and strength `0.5`; charge minimum distance is `30`.

Ograph uses world coordinates scaled by `0.2`: distance `6`, charge `-40`,
collision radius `12`, and charge minimum distance `6`. Displayed node size
does not set the collision radius in this profile. Force order is center X/Y,
degree-normalized links, charge, then collision. Unlike the optional Calm and
Lively profiles, reference collision corrections do not fade with heat.

The observed reference simulation cadence was approximately 51 steps/s.
Ograph keeps a fixed 60 steps/s in both Worker and main-thread runtimes.
For reference step ratio `h = 51 / 60` and velocity retention `r = 0.6`, it
uses retention `r ** h` and alpha retention `(1 - alphaDecay) ** h`.
Force impulses are scaled by `h * (1 - r ** h) / r ** h * r / (1 - r)`.
This preserves exponential decay and steady damped response; it is an
approximation of the full nonlinear trajectory.

Pointer down pins without reheating. Movement uses heat `0.3`, and release
returns the target to zero. Rendering follows the pointer immediately while
springs read the previous integrated anchor, matching the observed reference
input order. Artificial neighbor position/velocity injection is removed.

## Method and results

Two gestures were recorded: dragging a large hub and dragging an ordinary node
with three links, each about two median link lengths over 600 ms, then releasing.
The actual compiled Ograph Worker was replayed from the same anonymous starting
positions with the same input coordinates and timestamps. Nodes were grouped
by graph distance from the dragged node; the dragged node itself was excluded.

The metric below sums per-sample RMS displacement within each time interval,
divides by interval duration, and normalizes by median link length. It measures
movement speed in those groups, not frame rate or positional identity.

| Gesture / group | Reference speed, first 0.5 s after release | Ograph speed | Relative difference |
| --- | ---: | ---: | ---: |
| Hub, direct neighbors | 0.69512 | 0.68505 | -1.45% |
| Hub, two hops | 0.29091 | 0.28403 | -2.37% |
| Hub, farther nodes | 0.19550 | 0.19670 | +0.61% |
| Three-link node, direct neighbors | 0.12848 | 0.12639 | -1.63% |
| Three-link node, two hops | 0.13176 | 0.13106 | -0.53% |
| Three-link node, farther nodes | 0.18323 | 0.18478 | +0.85% |

The hub's direct-neighbor speed falls from about `0.69` immediately after
release to `0.0057` in the 3.6–4.6 s interval measured from drag start
(reference: `0.0054`). The declining tail is close but not identical: one late
hub interval differs by about 12% at a small absolute speed (`0.0188` versus
`0.0168`). A late two-hop interval in the ordinary-node case differs by about 10%.

These results cover two gestures on one topology and reference configuration.
Different graph densities, starting layouts, drag speeds, and reference app
versions can differ. The deterministic Worker replay isolates physics from
browser scheduling; it does not prove matching display FPS. Floating-point,
integration, and engine differences remain, so pixel-identical motion is not
claimed.

## Verification and local artifacts

Validation passed: lint, 91 unit tests, bundle budgets, example builds, and 13
packed-consumer browser tests. Browser checks cover drag continuity, wheel/pan,
pause/resume, runtime fallback, and lifecycle behavior. A fixed-clock test also
checks that a 144Hz display does not accelerate fallback physics.

Local measurement fixtures and replay tools are kept under the ignored
`.tmp/obsidian-review/` directory. `worker-propagation.mjs` builds and exercises
the actual Worker; `worker-propagation-results.json` and
`worker-neighbor-results.json` contain the replay results. The local comparison
page offers recorded speed curves and an interactive graph. These fixtures are
intentionally not distributed: no vault note titles or contents are included
in this report or the library.
