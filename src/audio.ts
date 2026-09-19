import { clamp } from "./core"
import { KSignal } from "./signal"

export const audioBands = {
  volume: [20, 16000],
  bass: [20, 140],
  "low-mid": [140, 400],
  mid: [400, 2000],
  "high-mid": [2000, 6000],
  treble: [6000, 16000],
} as const

export type AudioBandName = keyof typeof audioBands | "peak"

export type AudioSourceInput =
  | string
  | HTMLMediaElement
  | MediaStream
  | AudioNode
  | AnalyserNode

export function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  const nyquist = fftSize / 2
  return clamp(Math.round((hz * fftSize) / sampleRate), 0, nyquist)
}

export function bandEnergy(data: Uint8Array, fromBin: number, toBin: number): number {
  const start = Math.min(fromBin, toBin)
  const end = Math.max(fromBin, toBin)
  let sum = 0
  let count = 0
  for (let index = start; index <= end && index < data.length; index += 1) {
    sum += data[index] ?? 0
    count += 1
  }
  return count ? sum / count / 255 : 0
}

export function peakEnergy(data: Uint8Array): number {
  let max = 0
  for (let index = 0; index < data.length; index += 1) {
    max = Math.max(max, data[index] ?? 0)
  }
  return max / 255
}

export function resolveBand(name: string): Exclude<AudioBandName, "peak"> | "peak" | "none" {
  const key = name.trim().toLowerCase()
  if (key === "peak") return "peak"
  if (key === "lowmid") return "low-mid"
  if (key === "highmid") return "high-mid"
  if (key in audioBands) return key as Exclude<AudioBandName, "peak">
  return "none"
}

export class KinesisAudio {
  volume: KSignal
  bass: KSignal
  lowMid: KSignal
  mid: KSignal
  highMid: KSignal
  treble: KSignal
  peak: KSignal
  beat: KSignal
  private context: AudioContext | undefined
  private analyser: AnalyserNode | undefined
  private sourceNode: AudioNode | undefined
  private media: HTMLMediaElement | undefined
  private stream: MediaStream | undefined
  private bins = new Uint8Array(0)
  private levels: Record<string, number> = {
    volume: 0,
    bass: 0,
    "low-mid": 0,
    mid: 0,
    "high-mid": 0,
    treble: 0,
    peak: 0,
    beat: 0,
  }
  private previousVolume = 0
  private silentFrames = 0
  private connected = false
  private ownsDestination = false
  private ownsContext = false
  private unbind: Array<() => void> = []
  private onActivity: (() => void) | undefined

  constructor(source?: AudioSourceInput, onActivity?: () => void) {
    this.onActivity = onActivity
    this.volume = new KSignal(() => this.levels.volume ?? 0)
    this.bass = new KSignal(() => this.levels.bass ?? 0)
    this.lowMid = new KSignal(() => this.levels["low-mid"] ?? 0)
    this.mid = new KSignal(() => this.levels.mid ?? 0)
    this.highMid = new KSignal(() => this.levels["high-mid"] ?? 0)
    this.treble = new KSignal(() => this.levels.treble ?? 0)
    this.peak = new KSignal(() => this.levels.peak ?? 0)
    this.beat = new KSignal(() => this.levels.beat ?? 0)
    if (source !== undefined) this.connect(source)
  }

  get active(): boolean {
    if (this.media && this.media.paused) return false
    return this.connected && this.silentFrames < 12
  }

  connect(source: AudioSourceInput): this {
    if (typeof window === "undefined") return this
    this.disconnectGraph()
    const resolved = this.resolveSource(source)

    if (resolved instanceof AnalyserNode) {
      this.analyser = resolved
      this.context = resolved.context as AudioContext
      this.ownsContext = false
      this.bins = new Uint8Array(this.analyser.frequencyBinCount)
      this.connected = true
      this.wake()
      return this
    }

    if (!this.context) {
      this.context = new AudioContext()
      this.ownsContext = true
    }
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.bins = new Uint8Array(this.analyser.frequencyBinCount)

    if (resolved instanceof AudioNode) {
      this.sourceNode = resolved
      this.sourceNode.connect(this.analyser)
      this.connected = true
      this.wake()
      return this
    }

    if (resolved instanceof MediaStream) {
      this.stream = resolved
      this.sourceNode = this.context.createMediaStreamSource(resolved)
      this.sourceNode.connect(this.analyser)
      this.connected = true
      this.wake()
      return this
    }

    this.media = resolved
    this.sourceNode = this.context.createMediaElementSource(resolved)
    this.sourceNode.connect(this.analyser)
    this.analyser.connect(this.context.destination)
    this.ownsDestination = true
    const kick = () => {
      void this.context?.resume()
      this.wake()
    }
    resolved.addEventListener("play", kick)
    resolved.addEventListener("playing", kick)
    resolved.addEventListener("pause", kick)
    this.unbind.push(() => {
      resolved.removeEventListener("play", kick)
      resolved.removeEventListener("playing", kick)
      resolved.removeEventListener("pause", kick)
    })
    this.connected = true
    if (!resolved.paused) kick()
    return this
  }

  async microphone(): Promise<this> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return this.connect(stream)
  }

  frequency(hz: number): KSignal {
    return new KSignal(() => {
      if (!this.analyser) return 0
      const bin = hzToBin(hz, this.analyser.context.sampleRate, this.analyser.fftSize)
      return (this.bins[bin] ?? 0) / 255
    })
  }

  bin(index: number): KSignal {
    return new KSignal(() => (this.bins[index] ?? 0) / 255)
  }

  range(fromHz: number, toHz: number): KSignal {
    return new KSignal(() => {
      if (!this.analyser) return 0
      const from = hzToBin(fromHz, this.analyser.context.sampleRate, this.analyser.fftSize)
      const to = hzToBin(toHz, this.analyser.context.sampleRate, this.analyser.fftSize)
      return bandEnergy(this.bins, from, to)
    })
  }

  level(band: string): number {
    const resolved = resolveBand(band)
    if (resolved === "none") return 0
    return this.levels[resolved] ?? 0
  }

  binLevel(index: number): number {
    return (this.bins[index] ?? 0) / 255
  }

  get mediaElement(): HTMLMediaElement | undefined {
    return this.media
  }

  get paused(): boolean {
    return !this.media || this.media.paused
  }

  play(): Promise<void> | undefined {
    void this.context?.resume()
    return this.media?.play()
  }

  stop(): void {
    if (!this.media) return
    this.media.pause()
    this.media.currentTime = 0
  }

  sample(): boolean {
    if (!this.analyser || !this.connected) return false
    this.analyser.getByteFrequencyData(this.bins)
    const sampleRate = this.analyser.context.sampleRate
    const fftSize = this.analyser.fftSize
    ;(Object.keys(audioBands) as (keyof typeof audioBands)[]).forEach((name) => {
      const [fromHz, toHz] = audioBands[name]
      const from = hzToBin(fromHz, sampleRate, fftSize)
      const to = hzToBin(toHz, sampleRate, fftSize)
      this.levels[name] = bandEnergy(this.bins, from, to)
    })
    this.levels.peak = peakEnergy(this.bins)
    const volume = this.levels.volume ?? 0
    this.levels.beat = volume - this.previousVolume > 0.12 ? 1 : (this.levels.beat ?? 0) * 0.72
    this.previousVolume = volume
    if (volume < 0.02) this.silentFrames += 1
    else this.silentFrames = 0
    if (this.active) this.wake()
    return this.active
  }

  destroy(): void {
    this.disconnectGraph()
    this.unbind.forEach((fn) => fn())
    this.unbind = []
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = undefined
    }
    if (this.ownsContext) void this.context?.close()
    this.context = undefined
    this.connected = false
  }

  private wake(): void {
    this.silentFrames = 0
    this.onActivity?.()
  }

  private resolveSource(source: AudioSourceInput): HTMLMediaElement | MediaStream | AudioNode | AnalyserNode {
    if (typeof source === "string") {
      const element = document.querySelector(source)
      if (element instanceof HTMLMediaElement) return element
      const media = new Audio(source)
      media.crossOrigin = "anonymous"
      media.preload = "auto"
      return media
    }
    return source
  }

  private disconnectGraph(): void {
    this.unbind.forEach((fn) => fn())
    this.unbind = []
    try {
      this.sourceNode?.disconnect()
      if (this.ownsDestination) this.analyser?.disconnect()
    } catch {
      undefined
    }
    this.sourceNode = undefined
    this.analyser = undefined
    this.media = undefined
    this.ownsDestination = false
    this.connected = false
  }
}
