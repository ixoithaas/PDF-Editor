import { create } from 'zustand'
import type {
  Annotation,
  DocumentMeta,
  FormField,
  PageModel,
  SourceDoc,
  TextMatch,
  ToolId,
  ToolStyle,
} from '../types'
import { loadPdf, PasswordRequiredError, uid, type PDFJSProxy } from './pdf'
import { exportPdf as runExport, type ExportOptions } from './exportPdf'
import { getTextGeometry } from './textCache'
import { searchItems } from './textGeometry'
import { detectCharacterFields } from './detectBoxes'

export type LeftPanel = 'pages' | 'annotations' | 'forms' | 'none'
export type ZoomMode = 'custom' | 'width' | 'page'

export interface Snapshot {
  pages: PageModel[]
  annotations: Annotation[]
  formValues: Record<string, string>
  meta: DocumentMeta
}

export const DEFAULT_STYLE: ToolStyle = {
  color: '#e11d48',
  fillColor: '#fde68a',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 14,
  font: 'helvetica',
  align: 'left',
  filled: false,
}

const DEFAULT_META: DocumentMeta = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: 'PDF Editor',
  producer: 'PDF Editor',
}

export interface EditorState {
  /* ---- document ------------------------------------------------- */
  sources: SourceDoc[]
  primarySourceId: string | null
  pdfjsDocs: Record<string, PDFJSProxy>
  fileName: string
  loading: boolean
  loadingProgress: number
  error: string | null
  passwordPrompt: { open: boolean; incorrect: boolean; pending: File | null }

  pages: PageModel[]
  annotations: Annotation[]
  formFields: FormField[]
  formValues: Record<string, string>
  meta: DocumentMeta

  /* ---- history -------------------------------------------------- */
  past: Snapshot[]
  future: Snapshot[]
  savedAt: number | null
  dirty: boolean

  /* ---- ui ------------------------------------------------------- */
  tool: ToolId
  style: ToolStyle
  zoom: number
  zoomMode: ZoomMode
  selection: string | null
  activePageId: string | null
  leftPanel: LeftPanel
  rightPanelOpen: boolean
  searchOpen: boolean
  theme: 'light' | 'dark'
  busy: string | null
  toast: { id: string; message: string; tone: 'info' | 'success' | 'error' } | null
  showShortcuts: boolean
  showMetadata: boolean
  showExportOptions: boolean
  showEncryption: boolean
  showSplit: boolean

  /* ---- search ---------------------------------------------------- */
  searchQuery: string
  searchMatches: TextMatch[]
  searchIndex: number
  searching: boolean
}

export interface EditorActions {
  openFile: (file: File, password?: string) => Promise<void>
  openFiles: (files: File[], password?: string) => Promise<void>
  requestPassword: (file: File, incorrect: boolean) => void
  closePasswordPrompt: () => void
  closeDocument: () => void

  setTool: (tool: ToolId) => void
  setStyle: (patch: Partial<ToolStyle>) => void
  setZoom: (zoom: number, mode?: ZoomMode) => void
  zoomIn: () => void
  zoomOut: () => void
  setZoomMode: (mode: ZoomMode) => void
  setSelection: (id: string | null) => void
  setActivePage: (id: string | null) => void
  /** Toggles the panel; opens it when `panel` is not the current one. */
  setLeftPanel: (panel: LeftPanel) => void
  /** Sets the panel directly (no toggling). */
  setLeftPanelMode: (panel: LeftPanel) => void
  toggleRightPanel: () => void
  setSearchOpen: (open: boolean) => void
  toggleTheme: () => void
  setBusy: (message: string | null) => void
  showToast: (message: string, tone?: 'info' | 'success' | 'error') => void
  dismissToast: () => void
  setShowShortcuts: (open: boolean) => void
  setShowMetadata: (open: boolean) => void
  setShowExportOptions: (open: boolean) => void
  setShowEncryption: (open: boolean) => void
  setShowSplit: (open: boolean) => void

  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  /** Mutates an annotation without pushing a new history entry. */
  patchAnnotation: (id: string, patch: Partial<Annotation>) => void
  /** Opens a history entry, so `patch*` calls are undoable as one step. */
  beginHistory: () => void
  removeAnnotation: (id: string) => void
  removeSelected: () => void
  clearAnnotations: () => void

  runSearch: (query: string) => Promise<void>
  setSearchQuery: (query: string) => void
  gotoMatch: (index: number) => void
  nextMatch: () => void
  prevMatch: () => void

  rotatePage: (pageId: string, delta: number) => void
  setPageRotation: (pageId: string, rotation: number) => void
  deletePage: (pageId: string) => void
  duplicatePage: (pageId: string) => void
  movePage: (from: number, to: number) => void
  insertBlankPage: (afterPageId: string | null, size?: [number, number]) => void
  extractPages: (pageIds: string[]) => Promise<void>
  mergeFiles: (files: File[]) => Promise<void>
  setFormValue: (name: string, value: string) => void
  detectFormBoxes: () => Promise<void>
  updateMeta: (patch: Partial<DocumentMeta>) => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  exportDocument: (options?: Partial<ExportOptions>) => Promise<Uint8Array | null>
  saveAs: () => Promise<void>
  print: () => void
}

export type EditorStore = EditorState & EditorActions

const HISTORY_LIMIT = 120

function snapshot(state: EditorState): Snapshot {
  return {
    pages: state.pages.map((p) => ({ ...p })),
    annotations: state.annotations.map((a) => ({ ...a })) as Annotation[],
    formValues: { ...state.formValues },
    meta: { ...state.meta },
  }
}

function restore(snap: Snapshot): Partial<EditorState> {
  return {
    pages: snap.pages.map((p) => ({ ...p })),
    annotations: snap.annotations.map((a) => ({ ...a })) as Annotation[],
    formValues: { ...snap.formValues },
    meta: { ...snap.meta },
    dirty: true,
  }
}

export const useEditor = create<EditorStore>()((set, get) => {
  /** Push the current state onto the undo stack before mutating. */
  const commit = (mutate: (state: EditorState) => Partial<EditorState>) => {
    const state = get()
    const past = [...state.past, snapshot(state)].slice(-HISTORY_LIMIT)
    set({ past, future: [], dirty: true, ...mutate(state) })
  }

  return {
    sources: [],
    primarySourceId: null,
    pdfjsDocs: {},
    fileName: '',
    loading: false,
    loadingProgress: 0,
    error: null,
    passwordPrompt: { open: false, incorrect: false, pending: null },

    pages: [],
    annotations: [],
    formFields: [],
    formValues: {},
    meta: { ...DEFAULT_META },

    past: [],
    future: [],
    savedAt: null,
    dirty: false,

    tool: 'select',
    style: { ...DEFAULT_STYLE },
    zoom: 1,
    zoomMode: 'width',
    selection: null,
    activePageId: null,
    leftPanel: 'pages',
    rightPanelOpen: true,
    searchOpen: false,
    theme: 'dark',
    busy: null,
    toast: null,
    showShortcuts: false,
    showMetadata: false,
    showExportOptions: false,
    showEncryption: false,
    showSplit: false,

    searchQuery: '',
    searchMatches: [],
    searchIndex: -1,
    searching: false,

    /* ------------------------------------------------------- files */
    async openFile(file, password) {
      set({ loading: true, error: null, loadingProgress: 0 })
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const loaded = await loadPdf(bytes, {
          password,
          onProgress: (loadedBytes, total) => {
            set({ loadingProgress: total ? loadedBytes / total : 0 })
          },
        })

        const source: SourceDoc = { id: loaded.pages[0]?.sourceId ?? uid('src'), name: file.name, bytes }
        const pages = loaded.pages
        const formValues: Record<string, string> = {}
        loaded.formFields.forEach((f) => {
          formValues[f.name] = f.value
        })

        set({
          sources: [source],
          primarySourceId: source.id,
          pdfjsDocs: { [source.id]: loaded.pdfjsDoc },
          fileName: file.name,
          pages,
          annotations: [],
          formFields: loaded.formFields,
          formValues,
          meta: { ...DEFAULT_META, title: file.name.replace(/\.pdf$/i, '') },
          past: [],
          future: [],
          dirty: false,
          savedAt: Date.now(),
          activePageId: pages[0]?.id ?? null,
          selection: null,
          zoomMode: 'width',
          loading: false,
          loadingProgress: 1,
          passwordPrompt: { open: false, incorrect: false, pending: null },
        })
      } catch (err) {
        if (err instanceof PasswordRequiredError) {
          set({
            loading: false,
            passwordPrompt: { open: true, incorrect: err.incorrect, pending: file },
          })
          return
        }
        set({ loading: false, error: (err as Error).message })
      }
    },

    async openFiles(files, password) {
      if (!files.length) return
      if (files.length === 1) {
        await get().openFile(files[0], password)
        return
      }
      set({ loading: true, error: null })
      try {
        const sources: SourceDoc[] = []
        const pdfjsDocs: Record<string, PDFJSProxy> = {}
        const pages: PageModel[] = []
        const formFields: FormField[] = []

        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const loaded = await loadPdf(bytes, { password })
          const source: SourceDoc = {
            id: loaded.pages[0]?.sourceId ?? uid('src'),
            name: file.name,
            bytes,
          }
          sources.push(source)
          pdfjsDocs[source.id] = loaded.pdfjsDoc
          pages.push(...loaded.pages)
          formFields.push(...loaded.formFields)
        }

        const formValues: Record<string, string> = {}
        formFields.forEach((f) => {
          formValues[f.name] = f.value
        })

        set({
          sources,
          primarySourceId: sources[0].id,
          pdfjsDocs,
          fileName: files[0].name,
          pages,
          annotations: [],
          formFields,
          formValues,
          meta: { ...DEFAULT_META, title: files[0].name.replace(/\.pdf$/i, '') },
          past: [],
          future: [],
          dirty: false,
          savedAt: Date.now(),
          activePageId: pages[0]?.id ?? null,
          selection: null,
          loading: false,
          passwordPrompt: { open: false, incorrect: false, pending: null },
        })
      } catch (err) {
        if (err instanceof PasswordRequiredError) {
          set({
            loading: false,
            passwordPrompt: { open: true, incorrect: err.incorrect, pending: files[0] },
          })
          return
        }
        set({ loading: false, error: (err as Error).message })
      }
    },

    requestPassword(file, incorrect) {
      set({ passwordPrompt: { open: true, incorrect, pending: file } })
    },

    closePasswordPrompt() {
      set({ passwordPrompt: { open: false, incorrect: false, pending: null } })
    },

    closeDocument() {
      const { pdfjsDocs } = get()
      Object.values(pdfjsDocs).forEach((d) => {
        try {
          void d.destroy()
        } catch {
          /* ignore */
        }
      })
      set({
        sources: [],
        primarySourceId: null,
        pdfjsDocs: {},
        fileName: '',
        pages: [],
        annotations: [],
        formFields: [],
        formValues: {},
        meta: { ...DEFAULT_META },
        past: [],
        future: [],
        selection: null,
        activePageId: null,
        dirty: false,
        error: null,
      })
    },

    /* --------------------------------------------------------- ui */
    setTool(tool) {
      set({ tool, selection: tool === 'select' ? get().selection : null })
    },
    setStyle(patch) {
      set({ style: { ...get().style, ...patch } })
    },
    setZoom(zoom, mode = 'custom') {
      set({ zoom: Math.min(10, Math.max(0.1, zoom)), zoomMode: mode })
    },
    zoomIn() {
      const { zoom } = get()
      get().setZoom(Math.round((zoom + 0.1) * 10) / 10)
    },
    zoomOut() {
      const { zoom } = get()
      get().setZoom(Math.round((zoom - 0.1) * 10) / 10)
    },
    setZoomMode(mode) {
      set({ zoomMode: mode })
    },
    setSelection(id) {
      set({ selection: id })
    },
    setActivePage(id) {
      set({ activePageId: id })
    },
    setLeftPanel(panel) {
      set({ leftPanel: get().leftPanel === panel ? 'none' : panel })
    },
    setLeftPanelMode(panel) {
      set({ leftPanel: panel })
    },
    toggleRightPanel() {
      set({ rightPanelOpen: !get().rightPanelOpen })
    },
    setSearchOpen(open) {
      set({ searchOpen: open })
    },
    toggleTheme() {
      set({ theme: get().theme === 'dark' ? 'light' : 'dark' })
    },
    setBusy(message) {
      set({ busy: message })
    },
    showToast(message, tone = 'info') {
      set({ toast: { id: uid('toast'), message, tone } })
    },
    dismissToast() {
      set({ toast: null })
    },
    setShowShortcuts(open) {
      set({ showShortcuts: open })
    },
    setShowMetadata(open) {
      set({ showMetadata: open })
    },
    setShowExportOptions(open) {
      set({ showExportOptions: open })
    },
    setShowEncryption(open) {
      set({ showEncryption: open })
    },
    setShowSplit(open) {
      set({ showSplit: open })
    },

    /* ------------------------------------------------ annotations */
    addAnnotation(annotation) {
      commit((state) => ({ annotations: [...state.annotations, annotation] }))
    },
    updateAnnotation(id, patch) {
      commit((state) => ({
        annotations: state.annotations.map((a) =>
          a.id === id ? ({ ...a, ...patch } as Annotation) : a,
        ),
      }))
    },
    patchAnnotation(id, patch) {
      set((state) => ({
        annotations: state.annotations.map((a) =>
          a.id === id ? ({ ...a, ...patch } as Annotation) : a,
        ),
        dirty: true,
      }))
    },

    beginHistory() {
      const state = get()
      set({ past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: [] })
    },

    removeAnnotation(id) {
      commit((state) => ({
        annotations: state.annotations.filter((a) => a.id !== id),
        selection: state.selection === id ? null : state.selection,
      }))
    },
    removeSelected() {
      const { selection } = get()
      if (!selection) return
      get().removeAnnotation(selection)
    },
    clearAnnotations() {
      commit(() => ({ annotations: [], selection: null }))
    },

    /* -------------------------------------------------------- search */
    setSearchQuery(query) {
      set({ searchQuery: query })
    },

    async runSearch(query) {
      const trimmed = query.trim()
      if (!trimmed) {
        set({ searchMatches: [], searchIndex: -1, searching: false, searchQuery: query })
        return
      }
      const state = get()
      set({ searching: true, searchQuery: query })
      const matches: TextMatch[] = []
      try {
        for (const [index, page] of state.pages.entries()) {
          const doc = state.pdfjsDocs[page.sourceId]
          if (!doc || page.blank) continue
          try {
            const pdfPage = await doc.getPage(page.sourceIndex + 1)
            const { items } = await getTextGeometry(page.sourceId, page.sourceIndex, pdfPage)
            matches.push(...searchItems(items, trimmed, page.id, index))
          } catch {
            /* skip unreadable pages */
          }
        }
      } finally {
        set({
          searchMatches: matches,
          searchIndex: matches.length ? 0 : -1,
          searching: false,
        })
        if (matches.length) get().gotoMatch(0)
      }
    },

    gotoMatch(index) {
      const { searchMatches } = get()
      if (!searchMatches.length) return
      const safe = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
      const match = searchMatches[safe]
      set({ searchIndex: safe, activePageId: match.pageId })
      requestAnimationFrame(() => {
        document.querySelector(`[data-match-id="${match.pageId}:${safe}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    },

    nextMatch() {
      get().gotoMatch(get().searchIndex + 1)
    },

    prevMatch() {
      get().gotoMatch(get().searchIndex - 1)
    },

    /* ----------------------------------------------------- pages */
    rotatePage(pageId, delta) {
      commit((state) => {
        const pages = state.pages.map((page) => {
          if (page.id !== pageId) return page
          const rotation = (((page.rotation + delta) % 360) + 360) % 360
          return { ...page, rotation }
        })
        // Keep text upright when the page is rotated.
        const annotations = state.annotations.map((a) => {
          const page = pages.find((p) => p.id === pageId)
          if (!page || a.pageId !== pageId) return a
          if (a.kind !== 'text') return a
          const angle = (((a.angle + delta) % 360) + 360) % 360
          return { ...a, angle }
        })
        return { pages, annotations }
      })
    },

    setPageRotation(pageId, rotation) {
      commit((state) => {
        const current = state.pages.find((p) => p.id === pageId)
        if (!current) return {}
        const delta = ((((rotation - current.rotation) % 360) + 360) % 360) as number
        const pages = state.pages.map((page) =>
          page.id === pageId ? { ...page, rotation } : page,
        )
        const annotations = state.annotations.map((a) => {
          if (a.pageId !== pageId || a.kind !== 'text') return a
          const angle = (((a.angle + delta) % 360) + 360) % 360
          return { ...a, angle }
        })
        return { pages, annotations }
      })
    },

    deletePage(pageId) {
      commit((state) => {
        const pages = state.pages.filter((p) => p.id !== pageId)
        const annotations = state.annotations.filter((a) => a.pageId !== pageId)
        return {
          pages,
          annotations,
          activePageId: state.activePageId === pageId ? (pages[0]?.id ?? null) : state.activePageId,
          selection: null,
        }
      })
    },

    duplicatePage(pageId) {
      commit((state) => {
        const index = state.pages.findIndex((p) => p.id === pageId)
        if (index < 0) return {}
        const original = state.pages[index]
        const copy: PageModel = { ...original, id: uid('page') }
        const annotations = state.annotations
          .filter((a) => a.pageId === pageId)
          .map((a) => ({ ...a, id: uid('ann'), pageId: copy.id }) as Annotation)
        const pages = [...state.pages]
        pages.splice(index + 1, 0, copy)
        return { pages, annotations: [...state.annotations, ...annotations] }
      })
    },

    movePage(from, to) {
      if (from === to) return
      commit((state) => {
        const pages = [...state.pages]
        const [moved] = pages.splice(from, 1)
        if (!moved) return {}
        pages.splice(Math.max(0, Math.min(pages.length, to)), 0, moved)
        return { pages }
      })
    },

    insertBlankPage(afterPageId, size) {
      commit((state) => {
        const index = afterPageId
          ? state.pages.findIndex((p) => p.id === afterPageId)
          : state.pages.length - 1
        const template = state.pages[Math.max(0, index)] ?? state.pages[0]
        const width = size?.[0] ?? template?.width ?? 595
        const height = size?.[1] ?? template?.height ?? 842
        const blank: PageModel = {
          id: uid('page'),
          sourceId: template?.sourceId ?? state.primarySourceId ?? '',
          sourceIndex: -1,
          blank: true,
          rotation: 0,
          origin: [0, 0],
          width,
          height,
          intrinsicRotation: 0,
        }
        const pages = [...state.pages]
        pages.splice(index + 1, 0, blank)
        return { pages, activePageId: blank.id }
      })
    },

    async extractPages(pageIds) {
      const state = get()
      const selected = state.pages.filter((p) => pageIds.includes(p.id))
      if (!selected.length) return
      const set2 = new Set(pageIds)
      const annotations = state.annotations.filter((a) => set2.has(a.pageId))
      const formValues: Record<string, string> = {}
      state.formFields
        .filter((f) => set2.has(f.pageId))
        .forEach((f) => {
          formValues[f.name] = state.formValues[f.name] ?? f.value
        })

      if (!state.primarySourceId || !state.sources.length) return

      try {
        set({ busy: 'Extracting pages…' })
        const result = await runExport({
          sources: state.sources,
          primarySourceId: state.primarySourceId,
          pages: selected,
          annotations,
          formValues,
          detectedFields: state.formFields.filter((field) => field.detected && set2.has(field.pageId)),
          meta: state.meta,
        })
        const blob = new Blob([result.bytes as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${state.fileName.replace(/\.pdf$/i, '')}-pages.pdf`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        get().showToast(`Extracted ${selected.length} page(s)`, 'success')
      } catch (err) {
        get().showToast((err as Error).message, 'error')
      } finally {
        set({ busy: null })
      }
    },

    async mergeFiles(files) {
      const state = get()
      if (!files.length) return
      set({ busy: 'Merging documents…' })
      try {
        const sources = [...state.sources]
        const pdfjsDocs = { ...state.pdfjsDocs }
        const pages = [...state.pages]

        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const loaded = await loadPdf(bytes)
          const source: SourceDoc = { id: loaded.pages[0]?.sourceId ?? uid('src'), name: file.name, bytes }
          sources.push(source)
          pdfjsDocs[source.id] = loaded.pdfjsDoc
          pages.push(...loaded.pages)
        }

        set({ sources, pdfjsDocs, pages, dirty: true })
        get().showToast(`Merged ${files.length} document(s)`, 'success')
      } catch (err) {
        get().showToast((err as Error).message, 'error')
      } finally {
        set({ busy: null })
      }
    },

    setFormValue(name, value) {
      commit((state) => ({
        formValues: { ...state.formValues, [name]: value },
      }))
    },

    async detectFormBoxes() {
      const state = get()
      if (!state.pages.length) return
      set({ busy: 'Detecting printed form boxes…' })
      try {
        const detected = await detectCharacterFields(state.pages, state.pdfjsDocs)
        const current = get()
        const formFields = [...current.formFields.filter((field) => !field.detected), ...detected]
        const formValues = { ...current.formValues }
        detected.forEach((field) => { formValues[field.name] = '' })
        set({ formFields, formValues, leftPanel: 'forms' })
        if (detected.length) {
          get().showToast(`Found ${detected.length} box field${detected.length === 1 ? '' : 's'}. Enter values in the Fields panel, then export.`, 'success')
        } else {
          get().showToast('No character-box rows found. This works best on clear, printed box forms.', 'info')
        }
      } catch (err) {
        get().showToast((err as Error).message || 'Could not scan this PDF.', 'error')
      } finally {
        set({ busy: null })
      }
    },

    updateMeta(patch) {
      commit((state) => ({ meta: { ...state.meta, ...patch } }))
    },

    /* ---------------------------------------------------- history */
    undo() {
      const { past, future } = get()
      if (!past.length) return
      const previous = past[past.length - 1]
      set({
        past: past.slice(0, -1),
        future: [...future, snapshot(get())],
        ...restore(previous),
      })
    },

    redo() {
      const { past, future } = get()
      if (!future.length) return
      const next = future[future.length - 1]
      set({
        future: future.slice(0, -1),
        past: [...past, snapshot(get())],
        ...restore(next),
      })
    },

    canUndo() {
      return get().past.length > 0
    },
    canRedo() {
      return get().future.length > 0
    },

    /* ----------------------------------------------------- export */
    async exportDocument(partial) {
      const state = get()
      if (!state.primarySourceId) return null
      set({ busy: 'Preparing your PDF…' })
      try {
        const result = await runExport({
          sources: state.sources,
          primarySourceId: state.primarySourceId,
          pages: state.pages,
          annotations: state.annotations,
          formValues: state.formValues,
          detectedFields: state.formFields.filter((field) => field.detected),
          meta: state.meta,
          ...partial,
        })
        if (result.warnings.length) {
          get().showToast(result.warnings[0], 'error')
        }
        set({ savedAt: Date.now(), dirty: false })
        return result.bytes
      } catch (err) {
        get().showToast((err as Error).message, 'error')
        return null
      } finally {
        set({ busy: null })
      }
    },

    async saveAs() {
      const state = get()
      set({ busy: 'Preparing your PDF…' })
      try {
        const result = await runExport({
          sources: state.sources,
          primarySourceId: state.primarySourceId!,
          pages: state.pages,
          annotations: state.annotations,
          formValues: state.formValues,
          detectedFields: state.formFields.filter((field) => field.detected),
          meta: state.meta,
        })
        const blob = new Blob([result.bytes as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${state.fileName.replace(/\.pdf$/i, '') || 'document'}-edited.pdf`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        set({ savedAt: Date.now(), dirty: false })
        get().showToast('PDF saved', 'success')
      } catch (err) {
        get().showToast((err as Error).message, 'error')
      } finally {
        set({ busy: null })
      }
    },

    print() {
      const state = get()
      if (!state.primarySourceId || !state.pages.length) return
      void (async () => {
        set({ busy: 'Preparing to print…' })
        try {
          const result = await runExport({
            sources: state.sources,
            primarySourceId: state.primarySourceId!,
            pages: state.pages,
            annotations: state.annotations,
            formValues: state.formValues,
            detectedFields: state.formFields.filter((field) => field.detected),
            meta: state.meta,
            flattenForm: true,
          })
          const url = URL.createObjectURL(
            new Blob([result.bytes as BlobPart], { type: 'application/pdf' }),
          )
          const frame = document.createElement('iframe')
          frame.style.position = 'fixed'
          frame.style.right = '0'
          frame.style.bottom = '0'
          frame.style.width = '0'
          frame.style.height = '0'
          frame.style.border = '0'
          frame.src = url
          document.body.appendChild(frame)
          frame.onload = () => {
            try {
              frame.contentWindow?.focus()
              frame.contentWindow?.print()
            } catch {
              get().showToast('Printing could not be started.', 'error')
            }
            setTimeout(() => {
              URL.revokeObjectURL(url)
              frame.remove()
            }, 60_000)
          }
        } catch (err) {
          get().showToast((err as Error).message, 'error')
        } finally {
          set({ busy: null })
        }
      })()
    },
  }
})
