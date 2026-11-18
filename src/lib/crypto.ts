/**
 * Self contained implementations of the primitives required by the PDF
 * standard security handler:
 *
 *   - MD5   (RFC 1321)
 *   - RC4   (Arcfour)
 *
 * `pdf-lib` cannot encrypt documents, so the editor performs the encryption
 * itself on the in-memory object graph right before serialisation.
 */

/* ------------------------------------------------------------------ *
 * MD5
 * ------------------------------------------------------------------ */

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
}

function rotl(x: number, n: number) {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

export function md5(input: Uint8Array): Uint8Array {
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const bitLen = input.length * 8
  const paddedLen = (((input.length + 8) >> 6) + 1) << 6
  const msg = new Uint8Array(paddedLen)
  msg.set(input)
  msg[input.length] = 0x80

  // Length in bits, little endian, 64 bit (we only need the low 32 bits).
  const view = new DataView(msg.buffer)
  view.setUint32(paddedLen - 8, bitLen >>> 0, true)
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true)

  const M = new Int32Array(16)
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getInt32(offset + j * 4, true)
    }

    let A = a0
    let B = b0
    let C = c0
    let D = d0

    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, SHIFTS[i])) >>> 0
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0, true)
  outView.setUint32(4, b0, true)
  outView.setUint32(8, c0, true)
  outView.setUint32(12, d0, true)
  return out
}

/* ------------------------------------------------------------------ *
 * RC4
 * ------------------------------------------------------------------ */

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i

  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff
    const tmp = S[i]
    S[i] = S[j]
    S[j] = tmp
  }

  const out = new Uint8Array(data.length)
  let x = 0
  let y = 0
  for (let i = 0; i < data.length; i++) {
    x = (x + 1) & 0xff
    y = (y + S[x]) & 0xff
    const tmp = S[x]
    S[x] = S[y]
    S[y] = tmp
    out[i] = data[i] ^ S[(S[x] + S[y]) & 0xff]
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Deterministic 16 byte document id derived from the file contents. */
export function documentId(seed: Uint8Array): Uint8Array {
  const digest = md5(concat(seed, new TextEncoder().encode(String(Date.now()))))
  return digest
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out)
    return out
  }
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256)
  return out
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}
