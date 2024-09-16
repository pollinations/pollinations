import about from "./text/about.md"
import blank from "./text/blank.md"
import failure from "./text/failure.md"
import help from "./text/help.md"
import instructions from "./text/instructions.md"
import landingLeft from "./text/landingLeft.md"
import landingRight from "./text/landingRight.md"
import impressum from "./text/impressum.md"
import expo from "./text/expo.md"
import landing from "./text/landing.md"
import integrate from './text/integrate.md'
import terms from './text/terms.md'
import event from './text/event.md'

export const textContent = {
  help,
  about,
  instructions,
  blank,
  failure,
  landing,
  landingLeft,
  landingRight,
  impressum,
  expo,
  integrate,
  terms,
  event,
}

const expoCtx = require.context("./expo", false, /\.md$/)
export const EXPOS = expoCtx.keys().reduce((prev, key, index) => {
  prev[index] = expoCtx(key).default
  return prev
}, {})
