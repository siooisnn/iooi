import { createHash } from "node:crypto";

// Server-side speech synthesis. The key stays here; the browser only ever
// sees the finished MP3.
//
// .env.local:
//   MINIMAX_API_KEY=...            (required; leaving it empty hides the speaker)
//   MINIMAX_TTS_VOICE=...          (voice_id, default male-qn-qingse)
//   MINIMAX_TTS_MODEL=...          (default speech-02-hd)
//   MINIMAX_TTS_SPEED=1            (0.5 – 2)
//   MINIMAX_BASE_URL=https://api.minimaxi.com
//   MINIMAX_GROUP_ID=...           (only for older accounts that still need it)

const DEFAULT_BASE_URL = "https://api.minimaxi.com";
const DEFAULT_MODEL = "speech-02-hd";
const DEFAULT_VOICE = "male-qn-qingse";
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_LIMIT = 40;

type TtsConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  groupId: string;
};

function readConfig(): TtsConfig {
  const speed = Number(process.env.MINIMAX_TTS_SPEED);
  return {
    apiKey: (process.env.MINIMAX_API_KEY || "").trim(),
    baseUrl: (process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ""),
    model: (process.env.MINIMAX_TTS_MODEL || DEFAULT_MODEL).trim(),
    voice: (process.env.MINIMAX_TTS_VOICE || DEFAULT_VOICE).trim(),
    speed: Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : 1,
    groupId: (process.env.MINIMAX_GROUP_ID || "").trim(),
  };
}

export function isTtsEnabled() {
  return Boolean(readConfig().apiKey);
}

// Replaying the same line should not be billed twice.
const cache = new Map<string, Buffer>();

function remember(key: string, audio: Buffer) {
  cache.delete(key);
  cache.set(key, audio);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export class TtsError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const config = readConfig();
  if (!config.apiKey) throw new TtsError("语音还没配置", 503);

  const key = createHash("sha256")
    .update(JSON.stringify([config.model, config.voice, config.speed, text]))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    return hit;
  }

  const url = new URL(`${config.baseUrl}/v1/t2a_v2`);
  if (config.groupId) url.searchParams.set("GroupId", config.groupId);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        text,
        stream: false,
        voice_setting: { voice_id: config.voice, speed: config.speed, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
        output_format: "hex",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new TtsError(timedOut ? "语音合成超时" : "连不上语音服务", 504);
  }

  const data = await response.json().catch(() => null) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  } | null;
  const code = data?.base_resp?.status_code;
  if (!response.ok || (code !== undefined && code !== 0)) {
    const detail = data?.base_resp?.status_msg || `HTTP ${response.status}`;
    console.error("[tts] minimax failed:", code ?? response.status, detail);
    throw new TtsError(`语音合成失败：${detail}`);
  }
  const hex = data?.data?.audio || "";
  if (!hex || !/^[0-9a-f]+$/i.test(hex)) throw new TtsError("语音服务没有返回声音");

  const audio = Buffer.from(hex, "hex");
  remember(key, audio);
  return audio;
}
