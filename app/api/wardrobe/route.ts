import {
  addWardrobeItem, editWardrobeItem, isWardrobeId, removeWardrobeItem, setWardrobeOutfit,
} from "@/app/lib/wardrobe";
import { getWardrobe } from "@/app/lib/wardrobe-store";
import { withWardrobeStore } from "@/app/lib/store";

function fail(error: unknown, status = 400) {
  return Response.json({ ok: false, error: error instanceof Error ? error.message : "衣柜出了点问题，请稍后再试。" }, { status });
}

function current() {
  return { ok: true, ...getWardrobe() };
}

/** Every garment (newest first) and what the doll has on. */
export async function GET() {
  return Response.json(current());
}

/**
 * JSON actions from her page: add (a new garment), edit, delete,
 * wear (the doll's whole outfit, one id per slot).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return fail(new Error("请求不完整。"));
  const input = (body.item && typeof body.item === "object" ? body.item : {}) as Record<string, unknown>;
  try {
    if (body.action === "add") {
      const item = await withWardrobeStore((store) => addWardrobeItem(store, input));
      return Response.json({ ...current(), item });
    }
    if (body.action === "wear") {
      await withWardrobeStore((store) => setWardrobeOutfit(store, body.outfit));
      return Response.json(current());
    }
    if (!isWardrobeId(body.id)) return fail(new Error("这件衣服的编号不对。"));
    const id = body.id;
    if (body.action === "edit") {
      const item = await withWardrobeStore((store) => editWardrobeItem(store, id, input));
      return Response.json({ ...current(), item });
    }
    if (body.action === "delete") {
      const removed = await withWardrobeStore((store) => removeWardrobeItem(store, id));
      if (!removed) return fail(new Error("这件已经不在衣柜里了。"), 404);
      return Response.json(current());
    }
    return fail(new Error("不认识这个操作。"));
  } catch (error) {
    return fail(error);
  }
}
