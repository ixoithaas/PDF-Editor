# PDF Editor

A full-featured, **client-side** PDF editor for the web. Open a PDF, annotate it,
fill forms, sign it, reorganise pages and export a standards-compliant file —
without a single byte ever leaving your device.

Built with Vite, React, TypeScript, Tailwind CSS, Zustand, PDF.js and pdf-lib.

## Features

### Documents
- Open one PDF or several at once (dropping multiple files merges them into one document)
- Drag & drop anywhere on the window
- Encrypted PDFs — you are prompted for the password, and it is only kept in memory
- Merge additional documents into the one already open
- Close a document and start over

### Pages
- Thumbnail sidebar with drag & drop reordering
- Rotate left / right, set an exact rotation, duplicate and delete pages
- Insert blank pages
- Extract a page range or an arbitrary selection into a brand new PDF
- Page sizes and rotations from the source document are respected (including `/Rotate`)

### Annotations
- **Text boxes** — 13 embedded fonts, size, colour, alignment, free rotation; double-click to edit
- **Highlight, underline, strike-out** — snapped to the real text geometry of the page
- **Freehand drawing** with width and colour controls, simplified while you draw
- **Shapes** — rectangle, ellipse, line and arrow, with fill and stroke options
- **Images** — drop in any picture, then move / resize it
- **Stamps** — eight built-in presets (APPROVED, DRAFT, CONFIDENTIAL, …) with custom colour
- **Signatures** — draw with the mouse or type your name in a script font
- Select, move, resize and rotate any annotation; erase with the eraser tool
- Undo / redo for every change (120 steps)

### Forms
- Detects interactive AcroForm fields (text, checkbox, dropdown, option list, radio, signature)
- Edit values from the sidebar or straight on the page
- Choose whether to flatten the values into the exported file

### Viewing
- Zoom presets, fit width, fit page, and Ctrl/⌘ + wheel zooming
- Pan tool and smooth page navigation
- Full text search with match count, next/previous and highlighted hits
- Light and dark themes

### Export
- Download the edited PDF (`Ctrl/⌘ + S`)
- Export options: flatten forms and add password protection
- **Real 128-bit RC4 encryption** (`/Standard`, `/V 2`, `/R 3`) implemented in-repo
- Writes title, author, subject, keywords, creator and producer
- Print the edited document

### Privacy
Everything happens in the browser. There is no server, no upload and no telemetry.

## Live site

<https://ixoithaas.github.io/PDF-Editor/>

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on `0.0.0.0:5173` |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Type-check only |
| `npm run selftest` | Headless test of the crypto + export pipeline |
| `npm run sample` | Regenerate `public/sample.pdf` |

Click **"Open the sample PDF"** on the welcome screen to try the editor straight
away.

## Deployment

Every push to `main` builds the app and publishes it to GitHub Pages at
<https://ixoithaas.github.io/PDF-Editor/> (see
`.github/workflows/deploy-pages.yml`).

Because that is a *project* site served from a `/<repo>/` subpath, the build
needs a matching `base`. The workflow sets `PAGES_BASE=/<repo>/`, which
`vite.config.ts` applies to every emitted asset URL. Local dev and previews
leave it at the default `/`, so nothing changes there.

If you ever rename the repository or add a custom domain, update `PAGES_BASE`
in the workflow — a custom domain at the root should drop it entirely.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ + O` | Open PDF files |
| `Ctrl/⌘ + S` | Download the edited PDF |
| `Ctrl/⌘ + Z` / `Ctrl/⌘ + Shift + Z` | Undo / redo |
| `Ctrl/⌘ + F` | Search |
| `Ctrl/⌘ + +` / `-` / `0` | Zoom in / out / fit width |
| `Ctrl/⌘ + D` | Duplicate the current page |
| `Ctrl/⌘ + wheel` | Zoom |
| `Page Up` / `Page Down` | Previous / next page |
| `V` `H` `T` `M` `U` `S` `P` `E` `R` `O` `L` `A` `I` `G` `B` | Select, pan, text, highlight, underline, strike-out, pen, eraser, rectangle, ellipse, line, arrow, image, signature, stamp |
| `Delete` / `Backspace` | Remove the selected annotation |
| `Escape` | Deselect / close search |
| `?` | Shortcut reference |

## Architecture

```
src/
├── components/          React UI
│   ├── App.tsx          Shell, drag & drop, theme, toasts
│   ├── Toolbar.tsx      File, history, zoom, search, export
│   ├── ToolRail.tsx     Vertical tool selector
│   ├── Viewer.tsx       Scroll container, zoom fitting, shortcuts, search, insert bar
│   ├── PageView.tsx     One page: PDF canvas + annotation overlay + interactions
│   ├── Sidebar.tsx      Page thumbnails, annotation list, form fields
│   ├── PropertiesPanel.tsx  Tool defaults and selected annotation / page properties
│   ├── Dialogs.tsx      Password, metadata, export, encryption, extract, shortcuts
│   ├── SignaturePad.tsx Draw or type a signature
│   └── Welcome.tsx      Landing screen
└── lib/
    ├── types.ts         Domain model (pages, annotations, forms, matches)
    ├── store.ts         Zustand store: document, history, tools, export
    ├── pdf.ts           PDF.js loading, page models, form discovery
    ├── exportPdf.ts     Rebuilds the output document and draws annotations
    ├── encryptPdf.ts    PDF standard security handler (RC4 128, /V 2 /R 3)
    ├── crypto.ts        MD5 + RC4
    ├── overlay.ts       Canvas rendering of annotations and hit testing
    ├── viewport.ts      User space ⇄ screen mapping (mirrors PDF.js' PageViewport)
    ├── textGeometry.ts  Text item geometry, markup rectangles, search
    ├── fonts.ts         Font catalogue and WOFF2 embedding for export
    ├── tools.ts         Tool definitions, stamp and colour presets
    └── geometry.ts      Rect, point and polyline helpers
```

### Coordinate system

Annotation geometry is stored in **absolute PDF user space** — the same space
`pdf-lib` draws in. PDF.js' viewport transform handles the conversion to canvas
pixels and applies the page rotation, so annotations stay exactly where they were
placed when a page is rotated, exported and reopened somewhere else.

### Encryption

`pdf-lib` deliberately does not implement encryption, so
`src/lib/encryptPdf.ts` walks the finished document's object graph, encrypts every
string and stream with a per-object RC4 key, writes the `/Encrypt` and `/ID`
entries into the trailer, and the file is then serialised with
`useObjectStreams: false` (strings inside object streams would otherwise be
encrypted twice). `npm run selftest` verifies the result by reopening the
encrypted document with PDF.js, which implements the decryption side.

## Fonts

Roboto and Lora are bundled as local WOFF2 files (`public/fonts/`) and embedded
into exported documents through `@pdf-lib/fontkit`, with a Latin-extended
fallback and a Helvetica fallback for glyphs a font cannot represent.

## Licence

Apache License 2.0 — see [LICENSE](./LICENSE).
