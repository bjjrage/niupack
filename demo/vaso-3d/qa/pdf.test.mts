import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArtwork, MAX_BYTES } from '../src/artwork.mts';

test('a renamed image cannot bypass PDF content validation', async () => {
  await assert.rejects(loadArtwork(new File(['not a PDF'], 'artwork.PDF', { type: 'application/pdf' })), /PDF válido/);
});

test('PDFs keep the existing file-size and empty-file limits before parsing', async () => {
  for (const data of ['', new Uint8Array(MAX_BYTES + 1)]) {
    await assert.rejects(loadArtwork(new File([data], 'artwork.pdf')), /12 MB/);
  }
});
