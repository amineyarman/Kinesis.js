# Changelog

## 2.0.0

A new Kinesis. Motion is declared with CSS custom properties or the matching JavaScript props,
instead of container components and `data-ks-*` attributes. See the
[migration guide](https://kinesisjs.com/docs/migration/).

### Added

- **Pointer effects**: `--k-parallax`, `--k-tilt`, `--k-depth`, `--k-magnetic`, `--k-repel`,
  `--k-follow`, `--k-look`, `--k-point`, `--k-spin`.
- **Reactions**: `--k-when: near | hover | press | view [once] | scroll | page` with the outputs
  `--k-x`, `--k-y`, `--k-rotate`, `--k-scale`, `--k-opacity`, `--k-blur`, `--k-color`,
  `--k-background`, plus `--k-delay` and `--k-stagger`.
- **Drag** with `--k-drag`, `--k-bounds`, and `--k-release: throw | stay | return`, keyboard
  arrows, and drag events.
- `--k-progress`, `--k-pointer-x`, and `--k-pointer-y`, written back so any CSS can take part.
- Spring presets (`soft`, `smooth`, `snappy`, `bouncy`, `heavy`, `instant`) and custom springs.
- `kinesis()` for JavaScript with `set()`, `reset()`, `bind()`, and `on()`; signals for pointer,
  scroll, time, and your own values, plus per-element `near` and `pointer` signals on every handle.
- `@amineyarman/kinesis/text` (accessible text splitting), `/audio` (audio signals), `/vue`
  (`v-kinesis` directive), `/auto`, and a `<script>` build.

### Changed

- Kinesis writes `translate`, `rotate`, and `scale` and never overwrites `transform` or
  `transform-origin`.
- Every property is registered with `@property`, so units, `calc()`, tokens, and any color syntax
  resolve in the browser.
- One frame loop for the page that stops when idle; no throttling options are needed.
- Respects `prefers-reduced-motion` by default.

### Removed

- `data-kinesistransformer`, `data-kinesisdepth`, `data-kinesisaudio`, `data-kinesispath`,
  `data-kinesisdistance-item`, `data-kinesisscroll-item`, and every `data-ks-*` attribute.
- Duration and easing options, replaced by springs.
