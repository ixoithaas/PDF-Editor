import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  PDFString,
  type PDFDocument,
} from 'pdf-lib'
import { concat, documentId, md5, rc4, toHex } from './crypto'

/**
 * Minimal implementation of the PDF "Standard" security handler using
 * RC4 128 bit encryption (algorithm 1, revision 3, /V 2 /R 3).
 *
 * `pdf-lib` deliberately does not implement encryption, so this module walks
 * the object graph of a finished document and encrypts every string and
 * stream in place, then attaches the /Encrypt dictionary to the trailer.
 */

const PAD = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa,
  0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe,
  0x64, 0x53, 0x69, 0x7a,
])

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

function padPassword(raw: string): Uint8Array {
  const bytes = latin1(raw || '')
  if (bytes.length >= 32) return bytes.slice(0, 32)
  const out = new Uint8Array(32)
  out.set(bytes)
  out.set(PAD.subarray(0, 32 - bytes.length), bytes.length)
  return out
}

/** Algorithm 2: compute the encryption key (revision >= 3). */
function computeKey(
  userPassword: string,
  ownerKey: Uint8Array,
  permissions: number,
  fileId: Uint8Array,
  keyLengthBits: number,
): Uint8Array {
  const p = permissions | 0
  const pBytes = new Uint8Array(4)
  pBytes[0] = p & 0xff
  pBytes[1] = (p >> 8) & 0xff
  pBytes[2] = (p >> 16) & 0xff
  pBytes[3] = (p >> 24) & 0xff

  let digest = md5(
    concat(
      padPassword(userPassword),
      ownerKey,
      pBytes,
      fileId,
    ),
  )

  const keyLen = keyLengthBits / 8
  for (let i = 0; i < 50; i++) {
    digest = md5(digest.subarray(0, keyLen))
  }
  return digest.subarray(0, keyLen)
}

/** Algorithm 3: compute the /O (owner) entry. */
function computeOwnerKey(
  ownerPassword: string,
  userPassword: string,
  keyLengthBits: number,
): Uint8Array {
  const ownerPadded = padPassword(ownerPassword || userPassword)
  let digest = md5(ownerPadded)
  const keyLen = keyLengthBits / 8
  for (let i = 0; i < 50; i++) digest = md5(digest)

  const key = digest.subarray(0, keyLen)
  const encrypted = rc4(key, padPassword(userPassword))
  // Revision 3 additionally mangles the result with the key.
  let temp: Uint8Array = new Uint8Array(encrypted)
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(key.length)
    for (let j = 0; j < key.length; j++) xorKey[j] = key[j] ^ i
    temp = rc4(xorKey, temp)
  }
  return temp
}

/** Algorithm 5: compute the /U (user) entry for revision 3. */
function computeUserKey(key: Uint8Array, fileId: Uint8Array): Uint8Array {
  let digest = md5(concat(PAD, fileId))
  let temp = rc4(key, digest)
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(key.length)
    for (let j = 0; j < key.length; j++) xorKey[j] = key[j] ^ i
    temp = rc4(xorKey, temp)
  }
  // 16 bytes of arbitrary padding.
  const out = new Uint8Array(32)
  out.set(temp)
  for (let i = 16; i < 32; i++) out[i] = (i * 7 + 13) & 0xff
  return out
}

export interface EncryptOptions {
  userPassword: string
  ownerPassword?: string
  /** Permission bits; defaults to -1 (all permissions). */
  permissions?: number
}

/**
 * Encrypts `doc` in place.  Must be called immediately before `doc.save()`,
 * and the document has to be serialised with `useObjectStreams: false`
 * because strings inside object streams would otherwise be encrypted twice.
 */
export function encryptDocument(doc: PDFDocument, options: EncryptOptions): void {
  const keyLengthBits = 128
  const permissions = options.permissions ?? -1
  const ownerPassword = options.ownerPassword || options.userPassword

  const context = doc.context

  /* ---- 1. Document ID (must exist before keys are derived) -------- */
  const seed = new TextEncoder().encode(
    `${doc.getPageCount()}:${doc.getTitle() ?? ''}:${Date.now()}:${Math.random()}`,
  )
  const id = documentId(seed)
  const idArray = PDFArray.withContext(context)
  idArray.push(PDFHexString.of(toHex(id)))
  idArray.push(PDFHexString.of(toHex(id)))
  context.trailerInfo.ID = idArray

  /* ---- 2. Standard security handler values ------------------------ */
  const ownerKey = computeOwnerKey(ownerPassword, options.userPassword, keyLengthBits)
  const key = computeKey(
    options.userPassword,
    ownerKey,
    permissions,
    id,
    keyLengthBits,
  )
  const userKey = computeUserKey(key, id)

  const encryptDict = PDFDict.withContext(context)
  encryptDict.set(PDFName.of('Filter'), PDFName.of('Standard'))
  encryptDict.set(PDFName.of('V'), PDFNumber.of(2))
  encryptDict.set(PDFName.of('R'), PDFNumber.of(3))
  encryptDict.set(PDFName.of('Length'), PDFNumber.of(keyLengthBits))
  encryptDict.set(PDFName.of('P'), PDFNumber.of(permissions))
  encryptDict.set(PDFName.of('O'), PDFHexString.of(toHex(ownerKey)))
  encryptDict.set(PDFName.of('U'), PDFHexString.of(toHex(userKey)))
  const encryptRef = context.register(encryptDict)
  context.trailerInfo.Encrypt = encryptRef

  /* ---- 3. Encrypt every string and stream ------------------------- */
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (ref.objectNumber === encryptRef.objectNumber) continue
    encryptObject(object, key, objectKey(key, ref))
  }
}

/** Algorithm 1 variant: per-object key = md5(fileKey | objNum | genNum). */
function objectKey(key: Uint8Array, ref: PDFRef): Uint8Array {
  const n = ref.objectNumber
  const g = ref.generationNumber
  const extra = new Uint8Array(5)
  extra[0] = n & 0xff
  extra[1] = (n >> 8) & 0xff
  extra[2] = (n >> 16) & 0xff
  extra[3] = g & 0xff
  extra[4] = (g >> 8) & 0xff
  return md5(concat(key, extra)).subarray(0, Math.min(16, key.length + 5))
}

function encryptString(value: Uint8Array, key: Uint8Array): PDFHexString {
  return PDFHexString.of(toHex(rc4(key, value)))
}

function encryptObject(object: unknown, key: Uint8Array, objectKeyValue: Uint8Array): void {
  if (object instanceof PDFStream) {
    // `getContents()` hands back the live buffer for both raw streams and
    // flate streams (their deflate output is cached), so encrypting in place
    // is safe and keeps the stream object identity intact.
    try {
      const contents = object.getContents()
      if (contents.length) contents.set(rc4(objectKeyValue, contents))
    } catch {
      /* streams without readable contents are skipped */
    }
    encryptContainer(object.dict, key, objectKeyValue)
    return
  }

  if (object instanceof PDFDict || object instanceof PDFArray) {
    encryptContainer(object, key, objectKeyValue)
  }
}

function encryptContainer(
  container: PDFDict | PDFArray,
  key: Uint8Array,
  objectKeyValue: Uint8Array,
): void {
  if (container instanceof PDFDict) {
    for (const [name, value] of container.entries()) {
      if (value instanceof PDFString || value instanceof PDFHexString) {
        container.set(name, encryptString(value.asBytes(), objectKeyValue))
      } else if (value instanceof PDFDict || value instanceof PDFArray) {
        encryptContainer(value, key, objectKeyValue)
      }
    }
    return
  }

  for (let i = 0; i < container.size(); i++) {
    const value = container.get(i)
    if (value instanceof PDFString || value instanceof PDFHexString) {
      container.set(i, encryptString(value.asBytes(), objectKeyValue))
    } else if (value instanceof PDFDict || value instanceof PDFArray) {
      encryptContainer(value, key, objectKeyValue)
    }
  }
}
