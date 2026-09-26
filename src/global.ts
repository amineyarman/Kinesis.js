// Entry for the <script> build: exposes `window.Kinesis` and starts automatically.
// The start is an explicit call so bundlers cannot drop it as an unused side effect.
import { autoStart } from "./auto"

export * from "./index"

autoStart()
