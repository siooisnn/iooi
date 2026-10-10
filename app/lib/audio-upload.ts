export type AudioUploadFormat = { extension: "mp3" | "m4a" | "aac" | "wav"; type: string };

const VIDEO_ERROR = "这是视频文件，改成 .mp3 不能转成音频。请先导出为 MP3 或 M4A 再上传";
const QUICKTIME_ERROR = "这是 QuickTime 格式，请先导出为 MP3 或 M4A 再上传";
const FORMAT_ERROR = "没有识别到支持的音频格式，请重新导出为 MP3、M4A、AAC 或 WAV 再上传";

function text(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

type Box = { type: string; start: number; end: number };

// Walk container boxes, never search compressed media for a matching word.
function boxes(bytes: Uint8Array, start = 0, end = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Box[] = [];
  while (start + 8 <= end) {
    let size = view.getUint32(start);
    let header = 8;
    if (size === 1) {
      if (start + 16 > end) break;
      const extended = view.getBigUint64(start + 8);
      if (extended > BigInt(end - start)) break;
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = end - start;
    if (size < header || start + size > end) break;
    result.push({ type: text(bytes, start + 4, 4), start: start + header, end: start + size });
    start += size;
  }
  return result;
}

/** Pick the serving format from the bytes, rather than the picker's MIME or filename. */
export function inspectAudioUpload(bytes: Uint8Array): AudioUploadFormat | { error: string } {
  if (bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WAVE") {
    return { extension: "wav", type: "audio/wav" };
  }
  if (bytes.length >= 4 && (text(bytes, 0, 3) === "ID3" ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x18) !== 0x08 && (bytes[1] & 0x06) !== 0))) {
    return { extension: "mp3", type: "audio/mpeg" };
  }
  if (bytes.length >= 7 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return { extension: "aac", type: "audio/aac" };
  }

  const top = boxes(bytes);
  const format = top.find((box) => box.type === "ftyp");
  if (!format || format.end - format.start < 8) return { error: FORMAT_ERROR };
  const quickTime = text(bytes, format.start, 4) === "qt  ";
  const movie = top.find((box) => box.type === "moov");
  if (!movie) return { error: quickTime ? QUICKTIME_ERROR : FORMAT_ERROR };
  const handlers: string[] = [];
  for (const track of boxes(bytes, movie.start, movie.end).filter((box) => box.type === "trak")) {
    const media = boxes(bytes, track.start, track.end).find((box) => box.type === "mdia");
    if (!media) continue;
    const handler = boxes(bytes, media.start, media.end).find((box) => box.type === "hdlr");
    if (handler && handler.end - handler.start >= 12) handlers.push(text(bytes, handler.start + 8, 4));
  }
  if (handlers.includes("vide")) return { error: VIDEO_ERROR };
  if (quickTime) return { error: QUICKTIME_ERROR };
  return handlers.includes("soun")
    ? { extension: "m4a", type: "audio/mp4" }
    : { error: FORMAT_ERROR };
}
