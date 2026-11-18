import type { AnnotationKind } from '../types'

export const ANNOTATION_LABELS: Record<AnnotationKind, string> = {
  text: 'Text',
  draw: 'Freehand',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  image: 'Image',
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikeout',
  stamp: 'Stamp',
}
