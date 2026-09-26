# Kinesis design

Kinesis makes interactive motion easy to create. You describe how elements react to the
pointer, scroll, and user actions, and Kinesis runs the physics, the measuring, and the writes.

This file is the short, binding version of the design. When code and this file disagree, fix one
of them in the same commit.

## Goals

1. **Easy first.** A useful effect takes one declaration: `--k-tilt: 8deg`.
2. **Declarative and imperative describe the same thing.** CSS custom properties, the
   `kinesis()` function, and the Vue directive all accept the same vocabulary.
3. **Let the browser do what it is good at.** Units, `calc()`, tokens, colors, and media queries
   are resolved by CSS. Kinesis only computes what CSS cannot: pointer geometry, springs, drag.
4. **Never break the author's styles.** Kinesis owns a small, documented set of properties and
   composes with everything else.
5. **No idle cost.** When nothing moves, nothing runs.

## Non-goals

Timelines and keyframe sequencing (use CSS animations, WAAPI, or GSAP), physics engines,
layout animation, 3D rendering. Kinesis stays a small interaction layer.

## Vocabulary

Four families. Every CSS name has a camelCase twin in JavaScript (`--k-parallax` becomes
`parallax`).

| Family | Properties |
| --- | --- |
| Context (inherited) | `--k-motion`, `--k-intensity`, `--k-perspective` |
| Pointer effects | `--k-parallax`, `--k-tilt`, `--k-magnetic`, `--k-repel`, `--k-follow`, `--k-look`, `--k-point`, `--k-spin`, `--k-depth` |
| Reactions | `--k-when` plus the outputs `--k-x`, `--k-y`, `--k-rotate`, `--k-scale`, `--k-opacity`, `--k-blur`, `--k-color`, `--k-background` |
| Gestures | `--k-drag` |
| Modifiers | `--k-area`, `--k-radius`, `--k-limit`, `--k-axis`, `--k-bounds`, `--k-release`, `--k-delay`, `--k-stagger`, `--k-track` |

Kinesis writes back three read-only variables so any CSS can react:
`--k-progress`, `--k-pointer-x`, `--k-pointer-y`.

`--k-when` answers "react to what?": `near`, `hover` (also keyboard focus), `press`, `view`
(add `once` to latch), `scroll` (the element crossing the viewport), `page` (document scroll).
The outputs answer "change what?" as `from to` pairs, or a single `to` value from rest.

Rules:

- A new word must add behavior that existing words cannot express. A different output
  channel is not a new word. Dock = `near` + `--k-scale`. Spotlight = `near` + `--k-opacity`.
- Anything CSS can already do well (keyframes, transitions, `offset-path`) is composed through
  `--k-progress` rather than re-implemented.

## Architecture

```
events ──> sources (pointer, scroll, states) ──> frame ──> read ──> compute ──> write
                                                   ^                              │
                                                   └──── sleeps when settled <────┘
```

- **One frame loop** for the whole page (`frame.ts`). It sleeps when every spring has
  settled and no input changed.
- **Discovery** (`scope.ts`). A scope (`[data-kinesis]`) scans its subtree once, reading
  11 trigger properties per element, and parses the full config only for elements that
  use Kinesis. Later scans are incremental: mutated subtrees, hovered or focused ancestor
  chains, a debounced full scan after resizes and stylesheet changes.
- **Typed properties.** Every property is registered with a real `@property` syntax
  (`<length>+`, `<angle>`, `<color>`...), so computed values arrive resolved:
  `calc(var(--space) * 2)`, `2em`, `5vw`, `oklch()`, and named colors all work.
- **Geometry** is measured in page coordinates at rest (Kinesis transforms removed), so
  scrolling never forces a re-measure. It is invalidated by ResizeObserver, mutations,
  nested scroll containers, and the pointer entering a scope.
- **Springs** use the closed-form damped oscillator, so they behave the same at 30, 60,
  or 144 Hz.
- **Rendering** writes the individual transform properties `translate`, `rotate`, and
  `scale`, never `transform`. Author values of those three are captured and composed.
  Colors are interpolated by the browser with `color-mix(in oklab, …)`.
- **Signals** (`signal.ts`) are pull-based and cached per frame, so a spring shared by
  several bindings is stepped exactly once.

## Ownership contract

On a target, Kinesis writes `translate`, `rotate`, `scale`, and, only when used,
`opacity`, `filter`, `color`, `background-color`, `touch-action`, and the three output
variables. For 3D it may set `perspective` on a parent and `transform-style: preserve-3d`
on the ancestors between a tilted element and its depth children. Everything is restored
on destroy. `transform` belongs to the author.

## Accessibility

- `prefers-reduced-motion: reduce` holds pointer effects and transform outputs at rest.
  Opacity, color, and blur still respond, and drag still works without inertia.
  Override with `configure({ reducedMotion })`.
- `hover` reactions also respond to `:focus-visible`. `press` responds to Enter and Space.
- Kinesis never adds roles, tabindex, or listeners to elements it does not animate.

## Performance budget

Measured in the browser suite (`tests/browser`):

- idle page: zero animation frames;
- discovery: under 5 ms for 2,000 elements;
- a class change inside a scope rescans only the mutated subtree;
- `set()` from JavaScript never triggers discovery.
