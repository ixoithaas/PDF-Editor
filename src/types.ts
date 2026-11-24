/* ------------------------------------------------------------------ *
 * Core domain types for the PDF editor.
 *
 * COORDINATE SYSTEM
 * -----------------
 * Annotation geometry is stored in *absolute PDF user space* of the page
 * it belongs to (origin = bottom-left of the MediaBox, y grows upwards,
 * units = PDF points / 1/72").  This is the same space `pdf-lib` draws in,
 * so exporting is a direct mapping with no lossy conversion.
 *
 * On screen the page may additionally be rotated (page /Rotate).  The
 * conversion between the two is handled by PDF.js' `PageViewport`, which
 * already knows how to map user space -> canvas pixels for a given
 * rotation.  See `src/lib/geometry.ts`.
 * ------------------------------------------------------------------ */

export type ToolId =
  | 'select'
  | 'hand'
  | 'text'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'image'
  | 'signature'
  | 'stamp'

export type MarkupKind = 'highlight' | 'underline' | 'strikeout'

export type FontId =
  | 'helvetica'
  | 'helvetica-bold'
  | 'times'
  | 'times-bold'
  | 'courier'
  | 'courier-bold'
  | 'roboto'
  | 'roboto-bold'
  | 'roboto-italic'
  | 'roboto-bolditalic'
  | 'lora'
  | 'lora-bold'
  | 'lora-italic'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type TextAlign = 'left' | 'center' | 'right'

/** One of the source files that make up the edited document. */
export interface SourceDoc {
  id: string
  name: string
  bytes: Uint8Array
}

/** A page inside the *edited* document. */
export interface PageModel {
  /** Stable id, survives reordering. */
  id: string
  /** Id of the source document this page originates from. */
  sourceId: string
  /** Index of the originating page in the source PDF. */
  sourceIndex: number
  /** True for pages the user inserted that have no source page. */
  blank?: boolean
  /** User-applied rotation in degrees (0 | 90 | 180 | 270). */
  rotation: number
  /** Absolute MediaBox origin [x0, y0] of the source page. */
  origin: [number, number]
  /** MediaBox width in points. */
  width: number
  /** MediaBox height in points. */
  height: number
  /** Intrinsic /Rotate of the source page (0 | 90 | 180 | 270). */
  intrinsicRotation: number
}

export interface AnnotationBase {
  id: string
  /** Id of the page this annotation lives on. */
  pageId: string
  opacity: number
  createdAt: number
}

export interface TextAnnotation extends AnnotationBase {
  kind: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  font: FontId
  align: TextAlign
  color: string
  /** User-space CCW angle of the baseline, in degrees. */
  angle: number
}

export interface DrawAnnotation extends AnnotationBase {
  kind: 'draw'
  points: Point[]
  color: string
  strokeWidth: number
}

export interface RectAnnotation extends AnnotationBase {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  color: string
  strokeWidth: number
  filled: boolean
  fillColor: string
  radius: number
}

export interface EllipseAnnotation extends AnnotationBase {
  kind: 'ellipse'
  x: number
  y: number
  width: number
  height: number
  color: string
  strokeWidth: number
  filled: boolean
  fillColor: string
}

export interface LineAnnotation extends AnnotationBase {
  kind: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}

export interface ImageAnnotation extends AnnotationBase {
  kind: 'image'
  x: number
  y: number
  width: number
  height: number
  /** data: URL of the image. */
  src: string
}

export interface MarkupAnnotation extends AnnotationBase {
  kind: MarkupKind
  rects: Rect[]
  color: string
  strokeWidth: number
}

export interface StampAnnotation extends AnnotationBase {
  kind: 'stamp'
  /** Bottom-left corner of the stamp box, in the rotated frame. */
  x: number
  y: number
  size: number
  label: string
  color: string
  /** User-space CCW angle of the stamp, in degrees. */
  angle: number
  boxWidth: number
  boxHeight: number
}

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | LineAnnotation
  | ImageAnnotation
  | MarkupAnnotation
  | StampAnnotation

export type AnnotationKind = Annotation['kind']

/** Editor-wide style used by the drawing tools. */
export interface ToolStyle {
  color: string
  fillColor: string
  strokeWidth: number
  opacity: number
  fontSize: number
  font: FontId
  align: TextAlign
  filled: boolean
}

/** One entry of the document search index. */
export interface TextMatch {
  pageId: string
  pageIndex: number
  /** Text of the PDF.js text item the match was found in. */
  text: string
  /** Index of the match inside `text`. */
  offset: number
  length: number
  /** Bounding box in absolute user space. */
  rect: Rect
}

export interface DocumentMeta {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
}

/** A form field discovered in the source document. */
export interface FormField {
  id: string
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'option' | 'signature'
  value: string
  options?: string[]
  readOnly: boolean
  required: boolean
  pageId: string
  /** Position of the widget in absolute user space. */
  rect: Rect
  /** True when this field was inferred from printed character boxes. */
  detected?: boolean
}
