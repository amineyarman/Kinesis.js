import { initKinesis, kinesis, type KinesisTarget } from "./api"
import type { KinesisProps } from "./config"
import type { KinesisOptions } from "./settings"

interface DirectiveBinding {
  value?: KinesisProps | null
  oldValue?: KinesisProps | null
}

const handles = new WeakMap<Element, KinesisTarget>()

/**
 * `v-kinesis="{ tilt: 8, area: 'self' }"`: the same vocabulary as CSS, reactive to your state.
 * Typed structurally, so this module does not import Vue.
 */
export const vKinesis = {
  mounted(el: Element, binding: DirectiveBinding) {
    handles.set(el, kinesis(el, binding.value ?? {}))
  },
  updated(el: Element, binding: DirectiveBinding) {
    const handle = handles.get(el)
    if (!handle) return
    const next = binding.value ?? {}
    const previous = binding.oldValue ?? {}
    if (JSON.stringify(next) === JSON.stringify(previous)) return
    const removed = (Object.keys(previous) as (keyof KinesisProps)[]).filter((key) => !(key in next))
    if (removed.length) handle.reset(...removed)
    handle.set(next)
  },
  beforeUnmount(el: Element) {
    handles.get(el)?.destroy()
    handles.delete(el)
  },
  getSSRProps() {
    return {}
  },
}

export interface KinesisPluginOptions extends KinesisOptions {
  /** Start CSS discovery for `[data-kinesis]` scopes on the client. Default true. */
  auto?: boolean
}

/** `app.use(KinesisPlugin)` registers `v-kinesis` and starts Kinesis in the browser. */
export const KinesisPlugin = {
  install(app: { directive(name: string, directive: unknown): unknown }, options: KinesisPluginOptions = {}) {
    app.directive("kinesis", vKinesis)
    if (options.auto !== false && typeof window !== "undefined") initKinesis(options)
  },
}

export type { KinesisProps }
