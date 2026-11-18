import type { PageModel } from '../types'

/**
 * Final /Rotate of a page = the intrinsic rotation of the source page plus
 * the rotation the user applied in the editor.
 */
export function finalRotation(page: PageModel): 0 | 90 | 180 | 270 {
  return ((((page.intrinsicRotation + page.rotation) % 360) + 360) % 360) as
    | 0
    | 90
    | 180
    | 270
}

/** Rotation of a page as it is displayed on screen. */
export function displayRotation(page: PageModel): number {
  return finalRotation(page)
}
