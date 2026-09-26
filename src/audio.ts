import { frame, wake } from "./frame"
import { clamp } from "./math"
import { source, type Signal } from "./signal"

export interface AudioOptions {
  /** Reuse an existing context. */
  context?: AudioContext
  /** Analyser resolution. Default 1024. */
  fftSize?: number
  /** Analyser smoothing, 0..1. Default 0.75. */
  smoothing?: number
}

export interface AudioSignals {
  /** Overall loudness, 0..1. */
  volume: Signal
  /** 20–250 Hz, 0..1. */
  bass: Signal
  /** 250 Hz–2 kHz, 0..1. */
  mid: Signal
  /** 2–16 kHz, 0..1. */
  treble: Signal
  /** Energy in any frequency range, 0..1. */
  band(fromHz: number, toHz: number): Signal
  readonly context: AudioContext
  /** Browsers start audio suspended; call from a click if sound was started programmatically. */
  resume(): Promise<void>
  destroy(): void
}

const mediaNodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

/**
 * Turns an `<audio>`/`<video>` element, a MediaStream, or any AudioNode into signals.
 *
 * ```js
 * const audio = createAudio(document.querySelector("audio"))
 * kinesis(".speaker").bind({ scale: audio.bass.map([0, 1], [1, 1.4]) })
 * ```
 */
export function createAudio(input: HTMLMediaElement | MediaStream | AudioNode, options: AudioOptions = {}): AudioSignals {
  const owned = !options.context && !(input instanceof AudioNode)
  const context =
    options.context ?? (input instanceof AudioNode ? (input.context as AudioContext) : new AudioContext())
  const analyser = context.createAnalyser()
  analyser.fftSize = options.fftSize ?? 1024
  analyser.smoothingTimeConstant = options.smoothing ?? 0.75

  let node: AudioNode
  const cleanups: Array<() => void> = []
  if (input instanceof HTMLMediaElement) {
    let media = mediaNodes.get(input)
    if (!media) {
      media = context.createMediaElementSource(input)
      mediaNodes.set(input, media)
      media.connect(context.destination)
    }
    node = media
    const onPlay = () => {
      void context.resume()
      wake()
    }
    input.addEventListener("play", onPlay)
    cleanups.push(() => input.removeEventListener("play", onPlay))
  } else if (input instanceof MediaStream) {
    node = context.createMediaStreamSource(input)
  } else {
    node = input
  }
  node.connect(analyser)

  const bins = new Uint8Array(analyser.frequencyBinCount)
  let sampledAt = -1
  const sample = () => {
    if (sampledAt === frame.id) return
    sampledAt = frame.id
    analyser.getByteFrequencyData(bins)
  }
  const playing = () =>
    input instanceof HTMLMediaElement ? !input.paused && !input.ended : context.state === "running"
  const toBin = (hz: number) => clamp(Math.round((hz / (context.sampleRate / 2)) * bins.length), 0, bins.length - 1)

  const band = (fromHz: number, toHz: number): Signal => {
    const from = toBin(fromHz)
    const to = Math.max(from, toBin(toHz))
    return source(() => {
      sample()
      let sum = 0
      for (let index = from; index <= to; index += 1) sum += bins[index]!
      return sum / ((to - from + 1) * 255)
    }, playing)
  }

  return {
    volume: band(20, 16000),
    bass: band(20, 250),
    mid: band(250, 2000),
    treble: band(2000, 16000),
    band,
    context,
    resume: () => context.resume(),
    destroy() {
      for (const fn of cleanups) fn()
      node.disconnect(analyser)
      if (owned && !(input instanceof HTMLMediaElement)) void context.close()
    },
  }
}
