#!/usr/bin/env node
// Check a Review Outbox receipt against a file, without a browser.
//
// The receipt is the product's claim: "these bytes, reviewed, with this digest".
// A claim nobody can check is decoration, so this reads the digest out of the
// HTML and recomputes the file's. Exit codes: 0 match, 1 mismatch, 2 unreadable
// input — the same convention as a test runner, because that is what it is.
//
// Usage:
//   node scripts/verify-receipt.mjs <receipt.html> <file>
//   node scripts/verify-receipt.mjs <receipt.html> --print   # just show the digest

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [, , receiptPath, targetPath] = process.argv
if (!receiptPath) {
  console.error('usage: node scripts/verify-receipt.mjs <receipt.html> <file | --print>')
  process.exit(2)
}

async function readOrExit(path, label) {
  try {
    return await readFile(path)
  } catch (error) {
    console.error(`${label} could not be read: ${error.code || error.message}`)
    process.exit(2)
  }
}

const receipt = (await readOrExit(receiptPath, 'receipt')).toString('utf8')

// The reviewed digest is rendered as: <code class="digest">审阅时 SHA-256 · <hex></code>
const reviewed = /<code class="digest">[^<]*?([a-f0-9]{64})<\/code>/i.exec(receipt)?.[1] ?? null
if (!reviewed) {
  console.error('this receipt carries no reviewed digest — it was exported before any decision, so there is nothing to verify')
  process.exit(2)
}

if (targetPath === '--print' || targetPath === undefined) {
  console.log(reviewed)
  process.exit(0)
}

const file = await readOrExit(targetPath, 'file')
const actual = createHash('sha256').update(file).digest('hex')

if (actual === reviewed) {
  console.log(`match  ${reviewed}`)
  process.exit(0)
}

console.error(`mismatch
  reviewed  ${reviewed}
  on disk   ${actual}
The file changed after it was reviewed. Re-review the current bytes; the
receipt describes the sequence above, not this one.`)
process.exit(1)
