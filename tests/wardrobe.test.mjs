import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './helpers/resolve-typescript.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'iooi-wardrobe-'));
const home = process.cwd();
process.chdir(scratch);
const wardrobe = await import('../app/lib/wardrobe.ts');
const pixels = await import('../app/lib/wardrobe-pixels.ts');
const { gridsToPng } = await import('../app/lib/wardrobe-png.ts');
const colors = await import('../app/lib/wardrobe-colors.ts');
const { handleRpc } = await import('../app/lib/mcp-server.ts');
const { CHAT_READ_TOOLS } = await import('../app/lib/claude-code.ts').catch(() => ({}));
const route = await import('../app/api/wardrobe/route.ts');
process.chdir(home);
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const call = (name, args, access) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, access);
const names = async (access) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, access)).result.tools.map((tool) => tool.name);
const post = async (body) => {
  const response = await route.POST(new Request('http://x/api/wardrobe', { method: 'POST', body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('looks are checked: category, shape, pattern, colours, texture, photo path', () => {
  const look = wardrobe.cleanLook({ category: 'top', shape: 'sweater', colors: ['#AA7755'] });
  assert.deepEqual(look, { category: 'top', shape: 'sweater', pattern: 'solid', colors: ['#aa7755', '#aa7755'] });
  assert.throws(() => wardrobe.cleanLook({ category: 'hat', shape: 'x', colors: ['#000000'] }), /上衣/);
  assert.throws(() => wardrobe.cleanLook({ category: 'top', shape: 'midi', colors: ['#000000'] }), /版型/);
  assert.throws(() => wardrobe.cleanLook({ category: 'top', shape: 'tee', colors: ['red'] }), /颜色/);
  assert.throws(() => wardrobe.cleanLook({ category: 'top', shape: 'tee', pattern: 'photo', colors: ['#000000'] }), /照片/);
  assert.equal(wardrobe.cleanTexture({ w: 2, h: 2, palette: ['#000000'], cells: '0010' }), null);
  assert.deepEqual(wardrobe.cleanTexture({ w: 2, h: 2, palette: ['#000000', '#FFFFFF'], cells: '0110' }).palette, ['#000000', '#ffffff']);
  assert.equal(wardrobe.cleanPhoto('/uploads/a.jpg'), '/uploads/a.jpg');
  assert.equal(wardrobe.cleanPhoto('/uploads/../store.json'), '');
  assert.equal(wardrobe.cleanPhoto('https://x.example/a.jpg'), '');
  // Every shape in the picker has a drawing.
  for (const category of wardrobe.WARDROBE_CATEGORIES) {
    for (const shape of wardrobe.WARDROBE_SHAPES[category]) assert.ok(pixels.hasShape(category, shape.id), `${category}/${shape.id}`);
  }
});

test('adding, editing and removing keep the outfit honest', () => {
  const store = {};
  const top = wardrobe.addWardrobeItem(store, { category: 'top', shape: 'offshoulder', colors: ['#8a5a3c'] }, 1000);
  assert.equal(top.name, '露肩');
  const skirt = wardrobe.addWardrobeItem(store, { category: 'skirt', shape: 'pleated', pattern: 'dots', colors: ['#4a3328', '#d8c9b0'], name: '  波点百褶裙 ' }, 2000);
  assert.equal(skirt.name, '波点百褶裙');
  assert.deepEqual(wardrobe.readWardrobe(store).items.map((item) => item.id), [skirt.id, top.id]);

  wardrobe.setWardrobeOutfit(store, { top: top.id, bottom: skirt.id });
  assert.throws(() => wardrobe.setWardrobeOutfit(store, { top: skirt.id }), /不能穿/);
  assert.deepEqual(wardrobe.readWardrobe(store).outfit, { top: top.id, bottom: skirt.id });

  // A top that becomes a coat comes off the doll.
  const coat = wardrobe.editWardrobeItem(store, top.id, { category: 'outer', shape: 'coat' }, 3000);
  assert.equal(coat.category, 'outer');
  assert.equal(coat.name, '露肩');
  assert.deepEqual(wardrobe.readWardrobe(store).outfit, { bottom: skirt.id });

  assert.equal(wardrobe.removeWardrobeItem(store, skirt.id), true);
  assert.deepEqual(wardrobe.readWardrobe(store).outfit, {});
  assert.equal(wardrobe.removeWardrobeItem(store, skirt.id), false);
  assert.throws(() => wardrobe.outfitFromIds(wardrobe.readWardrobe(store).items, ['nope-nope-nope']), /wardrobe_list/);
});

test('the doll and the garments draw on the 32×64 grid; PNGs come out', () => {
  const bare = pixels.renderDoll([]);
  assert.equal(bare.w, 32);
  assert.equal(bare.h, 64);
  assert.equal(bare.cells.length, 32 * 64);
  const sweater = { category: 'top', shape: 'sweater', pattern: 'stripes', colors: ['#8a5a3c', '#f0e0c8'] };
  const dressed = pixels.renderDoll([sweater]);
  assert.notDeepEqual(dressed.cells, bare.cells);
  // Mirrored: the dressed doll is the same colour on both sides of the chest.
  assert.equal(dressed.cells[22 * 32 + 12] !== null, true);
  const alone = pixels.renderGarment(sweater);
  assert.ok(alone.w > 4 && alone.w <= 32 && alone.h > 4 && alone.h <= 64);
  assert.equal(alone.cells.length, alone.w * alone.h);
  const png = gridsToPng([alone, dressed], { scale: 2 });
  assert.deepEqual(png.subarray(0, 8), PNG);
  assert.equal(png.readUInt32BE(16), (alone.w + 32 + 6) * 2);
});

test('colours come out of photo pixels, biggest first', () => {
  const data = [];
  for (let i = 0; i < 100; i += 1) data.push(...(i < 70 ? [120, 80, 50, 255] : i < 95 ? [240, 230, 210, 255] : [0, 0, 0, 0]));
  const palette = colors.paletteFromPixels(data, 4);
  assert.equal(palette[0].color, '#785032');
  assert.equal(palette[1].color, '#f0e6d2');
  assert.deepEqual(colors.mainColors(palette), ['#785032', '#f0e6d2']);
  const texture = colors.textureFromPixels(data.slice(0, 16 * 4), 4, 4, palette.map((item) => item.color));
  assert.equal(texture.cells, '0'.repeat(16));
  assert.ok(wardrobe.cleanTexture(texture));
});

test('her page adds, combines and removes; he only looks, from any access level', async () => {
  for (const access of ['read', 'life', 'full']) {
    const list = await names(access);
    for (const name of ['wardrobe_list', 'wardrobe_item', 'wardrobe_try']) assert.ok(list.includes(name), `${access} ${name}`);
  }
  if (CHAT_READ_TOOLS) assert.ok([...CHAT_READ_TOOLS].includes('mcp__iooi__wardrobe_try'));
  assert.match((await call('wardrobe_list', {}, 'read')).result.content[0].text, /空的/);

  const bad = await post({ action: 'add', item: { category: 'top' } });
  assert.equal(bad.status, 400);
  const sweater = (await post({ action: 'add', item: { category: 'top', shape: 'offshoulder', colors: ['#8a5a3c'], name: '棕色露肩毛衣', note: '配百褶裙', photo: '/uploads/missing.jpg' } })).body.item;
  const skirt = (await post({ action: 'add', item: { category: 'skirt', shape: 'pleated', pattern: 'dots', colors: ['#4a3328', '#d8c9b0'] } })).body.item;
  const shoes = (await post({ action: 'add', item: { category: 'shoes', shape: 'maryjane', colors: ['#1a1a1a', '#d4a640'] } })).body.item;
  const worn = await post({ action: 'wear', outfit: { top: sweater.id, bottom: skirt.id } });
  assert.deepEqual(worn.body.outfit, { top: sweater.id, bottom: skirt.id });
  assert.equal((await post({ action: 'wear', outfit: { shoes: skirt.id } })).status, 400);

  const listed = (await call('wardrobe_list', {}, 'read')).result.content[0].text;
  assert.match(listed, /衣柜共 3 件/);
  assert.match(listed, /上衣「棕色露肩毛衣」/);
  assert.match(listed, /她的备注：配百褶裙/);
  assert.doesNotMatch((await call('wardrobe_list', { category: 'shoes' }, 'read')).result.content[0].text, /棕色露肩毛衣\n/);

  // Missing photos stay missing: no synthetic garment or figure is sent.
  const one = (await call('wardrobe_item', { item_id: sweater.id }, 'read')).result;
  assert.equal(one.isError, false);
  assert.match(one.content[0].text, /露肩/);
  const images = one.content.filter((block) => block.type === 'image');
  assert.equal(images.length, 0);
  assert.match(one.content[0].text, /没有可查看的照片/);
  assert.doesNotMatch(one.content[0].text, /像素|小人/);
  assert.equal((await call('wardrobe_item', { item_id: 'not-a-real-id' }, 'read')).result.isError, true);

  // Looking at a combination never changes her saved outfit.
  const tried = (await call('wardrobe_try', { item_ids: [shoes.id, skirt.id] }, 'read')).result;
  assert.equal(tried.isError, false);
  assert.match(tried.content[0].text, /搭配预览/);
  assert.equal(tried.content.filter((block) => block.type === 'image').length, 0);
  assert.deepEqual((await (await route.GET()).json()).outfit, { top: sweater.id, bottom: skirt.id });
  assert.equal((await call('wardrobe_try', { item_ids: ['not-a-real-id'] }, 'read')).result.isError, true);

  const removed = await post({ action: 'delete', id: sweater.id });
  assert.deepEqual(removed.body.outfit, { bottom: skirt.id });
  assert.equal((await post({ action: 'delete', id: sweater.id })).status, 404);
});

test('read-only outfit previews send original photos and keep her selection unchanged', async () => {
  const previousCwd = process.cwd();
  const original = gridsToPng([pixels.renderGarment({ category: 'top', shape: 'tee', pattern: 'solid', colors: ['#ffffff', '#ffffff'] })]);
  mkdirSync(join(scratch, 'uploads'), { recursive: true });
  writeFileSync(join(scratch, 'uploads', 'original.png'), original);
  process.chdir(scratch);
  try {
    const top = (await post({ action: 'add', item: { category: 'top', shape: 'tee', colors: ['#ffffff'], name: '白色上衣', photo: '/uploads/original.png', note: '日常穿的' } })).body.item;
    const before = (await (await route.GET()).json()).outfit;
    for (const access of ['read', 'life', 'full']) {
      const one = (await call('wardrobe_item', { item_id: top.id }, access)).result;
      const oneImages = one.content.filter((block) => block.type === 'image');
      assert.equal(oneImages.length, 1);
      assert.deepEqual(Buffer.from(oneImages[0].data, 'base64'), original);
      const preview = (await call('wardrobe_try', { item_ids: [top.id] }, access)).result;
      assert.match(preview.content[0].text, /白色上衣/);
      assert.match(preview.content[0].text, /日常穿的/);
      assert.doesNotMatch(preview.content[0].text, /像素|小人/);
      assert.deepEqual(Buffer.from(preview.content.find((block) => block.type === 'image').data, 'base64'), original);
      assert.deepEqual((await (await route.GET()).json()).outfit, before);
    }
  } finally { process.chdir(previousCwd); }
});
