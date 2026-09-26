# Kinesis

Interactive motion for the web. Describe how elements react to the pointer, scroll, and touch,
in CSS or JavaScript, and Kinesis handles the physics.

```html
<section data-kinesis>
  <article class="card">…</article>
</section>
```

```css
.card {
  --k-tilt: 8deg;        /* turns toward the pointer */
  --k-parallax: 12px;    /* drifts against it */
  --k-motion: soft;      /* how it moves: soft, smooth, snappy, bouncy, heavy */
}
```

```js
import { initKinesis } from "@amineyarman/kinesis"
initKinesis()
```

That's the whole setup. Tokens, `calc()`, media queries, `:hover`, and dark-mode classes all work,
because the browser resolves your CSS before Kinesis reads it.

## Install

```bash
npm install @amineyarman/kinesis
```

Or without a build step:

```html
<script src="https://cdn.jsdelivr.net/npm/@amineyarman/kinesis/dist/kinesis.global.js"></script>
```

## The vocabulary

**Pointer effects**

| Property | Does |
| --- | --- |
| `--k-parallax: 20px` | drifts against the pointer (negative: with it) |
| `--k-tilt: 8deg` | turns toward the pointer in 3D |
| `--k-magnetic: .4` | leans toward a nearby pointer |
| `--k-repel: 30px` | moves away from a nearby pointer |
| `--k-follow: 1` | chases the pointer |
| `--k-look: 20deg` | turns to face the pointer (eyes, heads) |
| `--k-point: 0deg` | rotates to point at the pointer (arrows, needles) |
| `--k-spin: 180deg` | rotates flat as the pointer moves across (wheels, dials, limbs) |
| `--k-depth: 40px` | sits above a tilted parent |
| `--k-drag: both` | can be dragged, thrown, and snapped back |

**Reactions**: pick a trigger with `--k-when`, then say what changes.

```css
.dock img   { --k-when: near;  --k-scale: 1.6; --k-radius: 140px }
.button     { --k-when: press; --k-scale: .94 }
.card       { --k-when: hover; --k-y: -6px }
.reveal     { --k-when: view once; --k-opacity: 0 1; --k-y: 40px 0 }
```

Triggers: `near`, `hover` (and keyboard focus), `press` (and Enter/Space), `view`,
`scroll` (the element crossing the screen), `page` (document scroll).
Outputs: `--k-x`, `--k-y`, `--k-rotate`, `--k-scale`, `--k-opacity`, `--k-blur`,
`--k-color`, `--k-background`.

Kinesis also writes `--k-progress`, so any CSS can react. A reading-progress bar:

```css
.bar { --k-when: page; scale: var(--k-progress) 1; transform-origin: left }
```

## JavaScript

The same words, as props:

```js
import { kinesis, pointer } from "@amineyarman/kinesis"

const card = kinesis(".card", { tilt: 8, area: "self", motion: "bouncy" })
card.set({ tilt: 14 })  // overrides CSS
card.reset("tilt")      // back to CSS

kinesis(".speedometer").bind({
  rotate: pointer.speed.map([0, 3000], [-90, 90]).spring("snappy"),
})
```

Vue:

```js
import { KinesisPlugin } from "@amineyarman/kinesis/vue"
app.use(KinesisPlugin)
```

```vue
<img v-kinesis="{ parallax: depth * 10 }" />
```

Extras: `@amineyarman/kinesis/text` splits text into accessible, animatable characters, and
`@amineyarman/kinesis/audio` turns an `<audio>` element into signals.

## Principles

- **Your styles stay yours.** Kinesis writes `translate`, `rotate`, and `scale`, never `transform`,
  and composes with any values you set yourself.
- **Accessible by default.** It respects `prefers-reduced-motion`, mirrors hover on keyboard focus,
  and keeps split text readable by screen readers.
- **No idle cost.** Nothing runs while nothing moves; offscreen elements are skipped.
- **Small.** About 14 KB gzipped.

Docs, recipes, and a playground: https://kinesisjs.com. Design notes: [DESIGN.md](DESIGN.md).

## License

MIT © Amine Bouyarmane
