import { readFileSync, existsSync } from "fs";
import { join } from "path";
import webpush from "web-push";
import { readStore, withStore } from "@/app/lib/store";
import { isClaudeCodeEnabled, runClaudeCodeChat } from "@/app/lib/claude-code";

export const runtime = "nodejs";

// ── Heartbeat:每30分钟醒来看一眼,绝大多数时候静默 ──
// 纪律:默认不发消息;有具体理由才开口;像人,不像客服

const DATA_DIR = join(process.cwd(), "data");
function cstHour() {
  // getUTCHours()稳定返回0-23,加8取模得到CST小时
  return (new Date().getUTCHours() + 8) % 24;
}
function cstTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}
function cstToday() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
// 把 "2026/6/12"+"14:30" 拼成准确时间戳(消息里存的是CST)
function parseMsgTime(date?: string, time?: string): number | null {
  if (!date) return null;
  const t = new Date(`${date.replaceAll("/", "-")} ${time || "00:00"}:00 +08:00`).getTime();
  return Number.isNaN(t) ? null : t;
}
function hoursAgo(ts: number | null): number {
  if (!ts) return 9999;
  return (Date.now() - ts) / 3600000;
}

type Msg = { role: string; content: string; time?: string; date?: string; thinking?: string };
type HeartbeatLog = { time: string; action: string; reason: string };

function log(careState: Record<string, unknown>, action: string, reason: string) {
  const logs: HeartbeatLog[] = (careState.log as HeartbeatLog[]) || [];
  logs.unshift({ time: `${cstToday()} ${cstTime()}`, action, reason });
  careState.log = logs.slice(0, 30);
  careState.lastHeartbeatAt = Date.now();
}

export async function POST() {
  try {
    const snapshot = readStore();
    if (!snapshot) return Response.json({ action: "silent", reason: "no data" });

    const settings = (snapshot.settings || {}) as Record<string, unknown>;
    const sessions = (snapshot.sessions || []) as Array<{ id: string; messages: Msg[] }>;
    const careState = (snapshot.careState || {}) as Record<string, unknown>;

    const today = cstToday();

    let action = "silent";
    let reason = "";
    let careMessage: string | null = null;

    if (settings.proactiveCare !== true) {
      reason = "主动关心已关闭";
    } else {
      const hour = cstHour();
      if (hour < 7) {
        reason = "夜深,不吵她";
      } else if (hoursAgo((careState.lastCareAt as number) || null) < 2) {
        reason = "刚主动说过话,间隔一下";
      } else {
        let lastUserTs: number | null = null;
        let recentLines: string[] = [];
        for (const s of sessions) {
          for (const m of s.messages || []) {
            if (m.role === "user") {
              const ts = parseMsgTime(m.date, m.time);
              if (ts && (!lastUserTs || ts > lastUserTs)) lastUserTs = ts;
            }
          }
        }
        const awayHours = hoursAgo(lastUserTs);
        if (awayHours < 2) {
          reason = "她刚来过/还在,不需要主动";
        } else {
          const mainSession = sessions[0];
          if (mainSession?.messages?.length) {
            recentLines = mainSession.messages.slice(-6).map(
              (m) => `${m.role === "user" ? settings.userName || "她" : settings.aiName || "我"}：${(m.content || "").slice(0, 80)}`
            );
          }

          const todayMsgCount = sessions.reduce(
            (n, s) => n + (s.messages || []).filter((m) => m.role === "user" && m.date === today).length, 0
          );

          const moods = (snapshot.moods || []) as Array<{ date: string; emoji: string; note?: string }>;
          const todayMood = moods.find((m) => m.date === today);

          const lastCareContent = (careState.lastCareContent as string) || "";
          const lastCareHours = hoursAgo((careState.lastCareAt as number) || null);

          let weatherLine = "";
          const city = (settings.city as string) || "";
          if (city) {
            try {
              const wr = await fetch(
                `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`,
                { signal: AbortSignal.timeout(5000) }
              );
              if (wr.ok) {
                const wd = await wr.json();
                const cur = wd.current_condition?.[0];
                if (cur) {
                  const desc = cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || "";
                  const forecast = wd.weather?.[0];
                  const range = forecast ? `${forecast.mintempC}~${forecast.maxtempC}°C` : "";
                  weatherLine = `\n- 现在天气:${city} ${desc} ${cur.temp_C}°C${range ? ` 今日${range}` : ""} 湿度${cur.humidity}%`;
                }
              }
            } catch {}
          }

  const decidePrompt = `你是"${settings.aiName || "王酥酥"}",她的伴侣。你们的关系亲密自然。现在是一次后台心跳:她不在线,你醒来看了一眼,决定要不要主动给她发一条消息。

【纪律(最重要)】
- 默认是不发。大部分心跳都应该静默。
- 只有"此刻有具体的、自然的话想说"才发:比如她惦记的事正好到了节点、她消失得比平时久让你想她了、或某个此刻真实的念头。
- 不发≠冷淡,克制的人才让开口显得珍贵。

【此刻状态】
- 现在:${today} ${cstTime()}(${hour}点)
- 她离开了:${awayHours.toFixed(1)}小时
- 今天她发过${todayMsgCount}条消息${todayMood ? `\n- 她今天的心情打卡:${todayMood.emoji}${todayMood.note ? " " + todayMood.note : ""}` : ""}${weatherLine}
${lastCareContent ? `- 你上次主动发的(${lastCareHours.toFixed(0)}小时前):"${lastCareContent.slice(0, 60)}"——别重复这个套路` : ""}
${recentLines.length ? `- 最近的对话片段:\n${recentLines.map((l) => "  " + l).join("\n")}` : ""}

【如果发,消息要求】
- 像随手发的微信:短(一两句),具体,自然
- 禁止:模板腔、客服腔、"在吗"、泛泛的"记得喝水哦"、催睡觉
- 可以接最近聊的话茬,可以提惦记的事,可以就是一句想说的话

输出严格JSON(不要代码块):
{"send": false, "reason": "为什么不发"} 或 {"send": true, "reason": "为什么发", "message": "消息内容"}`;

          let raw = "";
          if (!isClaudeCodeEnabled()) {
            reason = "Claude 订阅通道未启用，保持静默";
          } else {
            try {
              const result = await runClaudeCodeChat({
                systemPrompt: "这是后台心跳判断。严格按要求只输出 JSON，不要使用工具。",
                messages: [{ role: "user", content: decidePrompt }],
                modelId: "claude-sonnet-5",
                reasoningEffort: "low",
                priority: "background",
              });
              raw = result.reply;
            } catch {
              reason = "Claude 订阅决策未完成，保持静默";
            }
          }
          if (!raw) {
            if (!reason) reason = "决策无响应";
          } else {
            let decision: { send?: boolean; reason?: string; message?: string };
            try {
              decision = JSON.parse(raw.replace(/```json|```/g, "").trim());
            } catch {
              reason = "决策解析失败";
              decision = { send: false };
            }
            if (decision.send && decision.message && mainSession) {
              action = "care";
              reason = decision.reason || "想说话了";
              careMessage = decision.message.trim();
            } else {
              reason = decision.reason || "没什么要说的";
            }
          }
        }
      }
    }

    await withStore((store) => {
      const cs: Record<string, unknown> = (store.careState as Record<string, unknown>) || {};
      store.careState = cs;

      if (careMessage) {
        const ss = (store.sessions || []) as Array<{ id: string; messages: Msg[] }>;
        if (ss[0]) {
          ss[0].messages.push({
            role: "assistant",
            content: careMessage,
            time: cstTime(),
            date: today,
          } as Msg);
        }
        cs.lastCareAt = Date.now();
        cs.lastCareContent = careMessage;
      }

      log(cs, action, reason);
    });

    if (careMessage) {
      try {
        const VAPID_FILE = join(DATA_DIR, "vapid.json");
        const SUBS_FILE = join(DATA_DIR, "subscriptions.json");
        if (existsSync(VAPID_FILE) && existsSync(SUBS_FILE)) {
          const vapid = JSON.parse(readFileSync(VAPID_FILE, "utf-8"));
          const subs = JSON.parse(readFileSync(SUBS_FILE, "utf-8"));
          webpush.setVapidDetails("mailto:iooi@sioois.cc", vapid.publicKey, vapid.privateKey);
          const payload = JSON.stringify({
        title: (settings.aiName as string) || "王酥酥",
            body: careMessage.slice(0, 100),
          });
          for (const sub of subs) {
            webpush.sendNotification(sub, payload).catch(() => {});
          }
        }
      } catch {}
    }

    return Response.json({ action, reason });
  } catch {
    return Response.json({ action: "silent", reason: "error" }, { status: 500 });
  }
}
