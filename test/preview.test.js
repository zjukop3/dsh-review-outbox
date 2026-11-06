import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { previewItem } from '../src/preview.js'

test('text preview reads only the registered workspace file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-preview-'))
  await writeFile(join(cwd, 'report.md'), '# Hello\nDSH', 'utf8')
  const preview = await previewItem({ cwd, path: 'report.md' })
  assert.equal(preview.kind, 'text')
  assert.match(preview.content, /Hello/)
  assert.equal(preview.truncated, false)
})

test('workspace escape through a symlink is rejected', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-preview-'))
  const outside = join(tmpdir(), `outside-${Date.now()}.txt`)
  await writeFile(outside, 'outside', 'utf8')
  await symlink(outside, join(cwd, 'link.txt'))
  await assert.rejects(previewItem({ cwd, path: 'link.txt' }), /outside the recorded workspace/)
})

test('images return a bounded data URL and other formats stay explicit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-preview-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await writeFile(join(cwd, 'pixel.png'), png)
  const image = await previewItem({ cwd, path: 'pixel.png' })
  assert.equal(image.kind, 'image')
  assert.match(image.dataUrl, /^data:image\/png;base64,/)
  await writeFile(join(cwd, 'deck.pptx'), png)
  const unsupported = await previewItem({ cwd, path: 'deck.pptx' })
  assert.equal(unsupported.kind, 'unsupported')
})
