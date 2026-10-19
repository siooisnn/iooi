import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-typescript.mjs';
const { addStickerToDraft, stickerDraftMessage } = await import('../app/lib/sticker-draft.ts');
const { MAX_IMAGES_PER_MESSAGE } = await import('../app/lib/message-images.ts');
const sticker = { id: 'st_real_sticker', name: '抱抱', url: '/uploads/st_real_sticker.gif' };

test('picking a sticker adds to the draft while preserving existing attachments', () => {
  const photo = { id: 'photo', kind: 'image', name: '照片', url: '/uploads/photo.jpg' };
  const original = [photo];
  const draft = addStickerToDraft(original, sticker, 'draft-1');
  assert.deepEqual(original, [photo]);
  assert.equal(draft.length, 2);
  assert.equal(draft[0], photo);
  assert.deepEqual(draft[1], { id: 'draft-1', kind: 'image', sticker: true, name: '抱抱', url: sticker.url });
});

test('text and a selected sticker go into the same outgoing message', () => {
  const attachments = addStickerToDraft([], sticker, 'draft-1');
  assert.deepEqual(stickerDraftMessage('想你了', attachments), { content: '想你了', source: 'sticker_message' });
  assert.deepEqual(stickerDraftMessage('', attachments), { content: '[表情包：抱抱]', source: 'sticker' });
  const photo = { id: 'photo', kind: 'image', name: '照片', url: '/uploads/photo.jpg' };
  assert.deepEqual(stickerDraftMessage('照片和表情一起发', [...attachments, photo]), { content: '照片和表情一起发' });
  assert.deepEqual(stickerDraftMessage('普通文字', []), { content: '普通文字' });
});

test('photos and stickers share the image limit and a full draft is not overwritten', () => {
  const draft = Array.from({ length: MAX_IMAGES_PER_MESSAGE }, (_, i) => ({ id: String(i), kind: 'image', name: '照片', url: `/uploads/${i}.png` }));
  assert.equal(addStickerToDraft(draft, sticker, 'extra'), null);
  assert.equal(draft.length, MAX_IMAGES_PER_MESSAGE);
  const file = { id: 'file', kind: 'file', name: '说明', url: '/uploads/note.txt' };
  assert.equal(addStickerToDraft([file], sticker, 'draft-1').length, 2);
});
