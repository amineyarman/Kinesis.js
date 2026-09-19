export function createFieldOverlay(root: HTMLElement): { destroy(): void } {
  if (typeof document === "undefined") return { destroy() {} }
  const canvas = document.createElement("canvas")
  canvas.setAttribute("data-kinesis-overlay", "")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8"
  const host = root.style.position ? root : root
  if (getComputedStyle(host).position === "static") host.style.position = "relative"
  host.appendChild(canvas)
  const ctx = canvas.getContext("2d")
  let frame = 0
  const pointer = { x: 0, y: 0, inside: false }
  const onMove = (event: PointerEvent) => {
    const box = root.getBoundingClientRect()
    pointer.x = event.clientX - box.left
    pointer.y = event.clientY - box.top
    pointer.inside = true
  }
  const onLeave = () => {
    pointer.inside = false
  }
  root.addEventListener("pointermove", onMove, { passive: true })
  root.addEventListener("pointerleave", onLeave)
  const draw = () => {
    const box = root.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(box.width * dpr))
    canvas.height = Math.max(1, Math.floor(box.height * dpr))
    if (!ctx) {
      frame = window.requestAnimationFrame(draw)
      return
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, box.width, box.height)
    if (pointer.inside) {
      ctx.strokeStyle = "rgba(47,107,255,.45)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, 80, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, 160, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = "rgba(47,107,255,.9)"
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    frame = window.requestAnimationFrame(draw)
  }
  frame = window.requestAnimationFrame(draw)
  return {
    destroy() {
      window.cancelAnimationFrame(frame)
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerleave", onLeave)
      canvas.remove()
    },
  }
}
