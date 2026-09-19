import { KSignal } from "./signal"

export type VideoSourceInput = string | HTMLVideoElement

export class KinesisVideo {
  progress: KSignal
  time: KSignal
  duration: KSignal
  playing: KSignal
  rate: KSignal
  progressValue = 0
  timeValue = 0
  durationValue = 0
  playingValue = 0
  rateValue = 1
  private media: HTMLVideoElement | undefined
  private ownsMedia = false
  private frame = 0
  private unbind: Array<() => void> = []
  private onActivity: (() => void) | undefined

  constructor(source?: VideoSourceInput, onActivity?: () => void) {
    this.onActivity = onActivity
    this.progress = new KSignal(() => this.progressValue)
    this.time = new KSignal(() => this.timeValue)
    this.duration = new KSignal(() => this.durationValue)
    this.playing = new KSignal(() => this.playingValue)
    this.rate = new KSignal(() => this.rateValue)
    if (source !== undefined) this.connect(source)
  }

  get active(): boolean {
    return Boolean(this.media && !this.media.paused && !this.media.ended)
  }

  get mediaElement(): HTMLVideoElement | undefined {
    return this.media
  }

  connect(source: VideoSourceInput): this {
    this.disconnect()
    const media = this.resolve(source)
    this.media = media
    const kick = () => {
      this.pull()
      if (this.active) {
        this.arm()
        this.onActivity?.()
      } else {
        this.disarm()
      }
    }
    media.addEventListener("play", kick)
    media.addEventListener("playing", kick)
    media.addEventListener("pause", kick)
    media.addEventListener("ended", kick)
    media.addEventListener("seeked", kick)
    media.addEventListener("timeupdate", kick)
    this.unbind.push(() => {
      media.removeEventListener("play", kick)
      media.removeEventListener("playing", kick)
      media.removeEventListener("pause", kick)
      media.removeEventListener("ended", kick)
      media.removeEventListener("seeked", kick)
      media.removeEventListener("timeupdate", kick)
    })
    this.pull()
    if (this.active) {
      this.arm()
      this.onActivity?.()
    }
    return this
  }

  play(): Promise<void> | undefined {
    return this.media?.play()
  }

  pause(): void {
    this.media?.pause()
  }

  sample(): boolean {
    this.pull()
    if (this.active) this.arm()
    else this.disarm()
    return this.active
  }

  destroy(): void {
    this.disconnect()
  }

  private pull(): void {
    const media = this.media
    if (!media) return
    const duration = media.duration
    this.durationValue = Number.isFinite(duration) && duration > 0 ? duration : 0
    this.timeValue = media.currentTime || 0
    this.progressValue = this.durationValue ? this.timeValue / this.durationValue : 0
    this.rateValue = media.playbackRate || 1
    this.playingValue = media.paused || media.ended ? 0 : 1
  }

  private arm(): void {
    const media = this.media as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: (now: number) => void) => number
        })
      | undefined
    if (!media?.requestVideoFrameCallback || this.frame) return
    const tick = () => {
      this.pull()
      if (!this.active) {
        this.frame = 0
        return
      }
      this.onActivity?.()
      this.frame = media.requestVideoFrameCallback!(tick)
    }
    this.frame = media.requestVideoFrameCallback(tick)
  }

  private disarm(): void {
    const media = this.media as
      | (HTMLVideoElement & {
          cancelVideoFrameCallback?: (id: number) => void
        })
      | undefined
    if (this.frame && media?.cancelVideoFrameCallback) media.cancelVideoFrameCallback(this.frame)
    this.frame = 0
  }

  private resolve(source: VideoSourceInput): HTMLVideoElement {
    if (typeof source === "string") {
      const found = document.querySelector(source)
      if (found instanceof HTMLVideoElement) return found
      const media = document.createElement("video")
      media.src = source
      media.preload = "auto"
      media.muted = true
      media.playsInline = true
      this.ownsMedia = true
      return media
    }
    return source
  }

  private disconnect(): void {
    this.disarm()
    this.unbind.forEach((fn) => fn())
    this.unbind = []
    if (this.ownsMedia) {
      this.media?.removeAttribute("src")
      this.media?.load()
    }
    this.media = undefined
    this.ownsMedia = false
    this.playingValue = 0
  }
}
