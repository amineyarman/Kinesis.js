export type ResponseCost = "A" | "B" | "C" | "D"
export type ResponseDomain = "transform" | "opacity" | "color" | "filter" | "custom"

export interface ResponseChannel {
  id: string
  title: string
  cost: ResponseCost
  domain: ResponseDomain
  ready: boolean
}

const item = (entry: ResponseChannel): ResponseChannel => entry

export const responseChannels: ResponseChannel[] = [
  item({ id: "x", title: "Translate X", cost: "A", domain: "transform", ready: true }),
  item({ id: "y", title: "Translate Y", cost: "A", domain: "transform", ready: true }),
  item({ id: "z", title: "Translate Z", cost: "A", domain: "transform", ready: true }),
  item({ id: "rotateX", title: "Rotate X", cost: "A", domain: "transform", ready: true }),
  item({ id: "rotateY", title: "Rotate Y", cost: "A", domain: "transform", ready: true }),
  item({ id: "rotateZ", title: "Rotate Z", cost: "A", domain: "transform", ready: true }),
  item({ id: "scaleX", title: "Scale X", cost: "A", domain: "transform", ready: true }),
  item({ id: "scaleY", title: "Scale Y", cost: "A", domain: "transform", ready: true }),
  item({ id: "path", title: "Path progress", cost: "A", domain: "transform", ready: true }),
  item({ id: "opacity", title: "Opacity", cost: "A", domain: "opacity", ready: true }),
  item({ id: "color", title: "Color", cost: "B", domain: "color", ready: true }),
  item({ id: "background", title: "Background", cost: "B", domain: "color", ready: true }),
  item({ id: "blur", title: "Blur", cost: "C", domain: "filter", ready: true }),
  item({ id: "brightness", title: "Brightness", cost: "B", domain: "filter", ready: true }),
  item({ id: "contrast", title: "Contrast", cost: "B", domain: "filter", ready: true }),
  item({ id: "saturate", title: "Saturate", cost: "B", domain: "filter", ready: true }),
  item({ id: "var", title: "Custom property", cost: "A", domain: "custom", ready: true }),
]

export const responseChannelMap = Object.fromEntries(
  responseChannels.map((entry) => [entry.id, entry]),
) as Record<string, ResponseChannel>

export function getResponseChannel(id: string): ResponseChannel | undefined {
  return responseChannelMap[id]
}
