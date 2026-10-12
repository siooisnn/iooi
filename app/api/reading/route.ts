import { MAX_READING_BYTES, isBookId, parseReadingText, validChapters } from "@/app/lib/reading-books";
import { looksLikeZip, parseEpub } from "@/app/lib/reading-epub";
import { addBook, attachText, deleteBook, editBook, getShelfBook, listShelf, loadBookText, markBook } from "@/app/lib/reading-shelf";

function fail(error: unknown, status = 400) {
  return Response.json({ ok: false, error: error instanceof Error ? error.message : "书架出了点问题，请稍后再试。" }, { status });
}

/** The shelf, or with ?book=<id> one book and its text. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("book");
  if (!id) return Response.json({ ok: true, books: listShelf() });
  if (!isBookId(id)) return fail(new Error("书的编号不对。"));
  const book = getShelfBook(id);
  if (!book) return fail(new Error("书架上没有这本书了。"), 404);
  return Response.json({ ok: true, book, chapters: book.hasText ? loadBookText(id) : null });
}

/**
 * JSON actions from her page:
 * add / edit / mark (her own progress only) / delete / legacy (a book that
 * used to live only on her phone).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return fail(new Error("请求不完整。"));
  try {
    if (body.action === "add") {
      const book = await addBook({ title: body.title, author: body.author, shelf: body.shelf, blurb: body.blurb, wantedBy: body.wantedBy });
      return Response.json({ ok: true, book, books: listShelf() });
    }
    if (body.action === "legacy") {
      const chapters = validChapters(body.chapters);
      if (!chapters || !isBookId(body.id)) return fail(new Error("这本旧书的内容不完整，没能搬过来。"));
      if (getShelfBook(body.id)) return Response.json({ ok: true, book: getShelfBook(body.id), books: listShelf() });
      await addBook({ id: body.id, title: body.title, shelf: "reading", chapters,
        createdAt: typeof body.createdAt === "number" ? body.createdAt : undefined });
      const position = body.position as { chapterId?: unknown; paragraphIndex?: unknown } | undefined;
      const book = position && typeof position.chapterId === "string" && body.read === true
        ? await markBook(body.id, "her", position) : getShelfBook(body.id);
      return Response.json({ ok: true, book, books: listShelf() });
    }
    if (!isBookId(body.id)) return fail(new Error("书的编号不对。"));
    if (body.action === "edit") {
      const book = await editBook(body.id, { title: body.title, author: body.author, shelf: body.shelf, blurb: body.blurb, wantedBy: body.wantedBy });
      return Response.json({ ok: true, book, books: listShelf() });
    }
    if (body.action === "mark") {
      const book = await markBook(body.id, "her", { chapterId: body.chapterId, paragraphIndex: body.paragraphIndex, percent: body.percent });
      return Response.json({ ok: true, book });
    }
    if (body.action === "delete") {
      await deleteBook(body.id);
      return Response.json({ ok: true, books: listShelf() });
    }
    return fail(new Error("不认识这个操作。"));
  } catch (error) {
    return fail(error);
  }
}

/**
 * A TXT or EPUB file as the raw body (an EPUB is told apart by its zip header).
 * ?title=&author=&shelf=&blurb=&wantedBy= makes a new book; an EPUB fills in a
 * missing title or author from its own metadata. ?book=<id> puts the text into
 * a book that is already on the shelf.
 */
export async function PUT(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength) return fail(new Error("文件是空的。"));
    if (bytes.byteLength > MAX_READING_BYTES) return fail(new Error("书的文件暂时最多支持 10MB。"), 413);
    const epub = looksLikeZip(bytes) ? parseEpub(bytes) : null;
    const chapters = epub ? epub.chapters : parseReadingText(bytes);
    const target = params.get("book");
    const book = target
      ? isBookId(target) ? await attachText(target, chapters) : null
      : await addBook({ title: params.get("title") || epub?.title, author: params.get("author") || epub?.author || "",
        shelf: params.get("shelf") || "reading", blurb: params.get("blurb") || "", wantedBy: params.get("wantedBy") || "", chapters });
    if (!book) return fail(new Error("书的编号不对。"));
    return Response.json({ ok: true, book, books: listShelf() });
  } catch (error) {
    return fail(error);
  }
}
