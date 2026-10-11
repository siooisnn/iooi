import { readStore, withStore } from "@/app/lib/store";
import { describePushResult, sendPushToAll } from "@/app/lib/push";
import { isClaudeCodeEnabled, runClaudeCodeChat } from "@/app/lib/claude-code";
import { latestUserSession } from "@/app/lib/chat-timeline";
import { blogHeartbeat } from "@/app/lib/blog-him";
import { lifeHeartbeat } from "@/app/lib/life-beat";
import { ensureLifeLog, noteLifeEntry, todayLifeLines } from "@/app/lib/life-log";
import { readSummerLight } from "@/app/lib/summer-light";
import { normalizeSystemPrompt } from "@/app/lib/app-settings";
import {
  CARE_INTERVAL_HOURS, DAILY_CARE_LIMIT, USER_AWAY_HOURS, cstHour, cstTime, cstToday, dailyCareCount, deliverCare, hoursAgo,
  lastUserMessageAt,
} from "@/app/lib/care-limits";
import { after } from "next/server";

export const runtime = "nodejs";

// ── Heartbeat:每30分钟醒来看一眼,每天最多主动10次 ──
// 纪律:默认不发消息;有具体理由才开口;像人,不像客服
// 开口前才读:立夏、最近3篇小暑、当前聊天窗口的上文、今天他自己做过的事。

// How much of the current chat he sees before deciding.
const RECENT_MESSAGES = 24;
const RECENT_MESSAGE_CHARS = 300;
const RECENT_TOTAL_CHARS = 6000;

type Msg = { role: string; content: string; time?: string; date?: string; thinking?: string; source?: string };
type CareSession = { id: string; kind?: string; messages: Msg[] };
type HeartbeatLog = { time: string; action: string; reason: string };

// careState.log is the short debug trail, quiet beats included. What he
// actually said goes in lifeLog, which the heartbeat page shows.
function log(careState: Record<string, unknown>, action: string, reason: string) {
  const logs: HeartbeatLog[] = (careState.log as HeartbeatLog[]) || [];
  logs.unshift({ time: `${cstToday()} ${cstTime()}`, action, reason });
  careState.log = logs.slice(0, 30);
  careState.lastHeartbeatAt = Date.now();
}

/** The tail of the current chat, newest last, within a character budget. */
function recentChat(messages: Msg[], me: string) {
  const lines: string[] = [];
  let total = 0;
  const usable = messages.filter((m) => !m.source?.startsWith("summer_") && (m.role === "user" || m.role === "assistant"));
  for (const m of usable.slice(-RECENT_MESSAGES).reverse()) {
    const body = (m.content || "").replace(/\s+/g, " ").trim();
    if (!body) continue;
    const line = `${m.date && m.time ? `[${m.date} ${m.time}] ` : ""}${m.role === "user" ? "她" : me}：${body.length > RECENT_MESSAGE_CHARS ? `${body.slice(0, RECENT_MESSAGE_CHARS)}……` : body}`;
    if (total + line.length > RECENT_TOTAL_CHARS && lines.length) break;
    lines.push(line);
    total += line.length;
  }
  return lines.reverse();
}

export async function POST() {
  // His blog visits ride the same heartbeat but run after the response: a post
  // takes a minute or two, and the caller shouldn't wait for it. It keeps its
  // own switch (settings.blogAutonomy) and its own log (store.blogBeat).
  after(() => blogHeartbeat().catch(() => undefined));
  // His own time (reading, wandering online) rides it too, same idea:
  // settings.lifeAutonomy, store.lifeBeat. It decides for itself whether now is the time.
  after(() => lifeHeartbeat().catch(() => undefined));
  try {
    const snapshot = readStore();
    if (!snapshot) return Response.json({ action: "silent", reason: "no data" });

    const settings = (snapshot.settings || {}) as Record<string, unknown>;
    const sessions = (snapshot.sessions || []) as CareSession[];
    const mainSession = latestUserSession(sessions);
    const careState = (snapshot.careState || {}) as Record<string, unknown>;

    const today = cstToday();

    let action = "silent";
    let reason = "";
    let careMessage: string | null = null;
    let lifeAt = 0;

    if (settings.proactiveCare !== true) {
      reason = "主动关心已关闭";
    } else {
      const hour = cstHour();
      if (hour < 7) {
        reason = "夜深,不吵她";
      } else if (dailyCareCount(careState, today) >= DAILY_CARE_LIMIT) {
        reason = "今天已主动关心10次，明天再来";
      } else if (hoursAgo((careState.lastCareAt as number) || null) < CARE_INTERVAL_HOURS) {
        reason = "刚主动说过话,间隔一下";
      } else {
        const awayHours = hoursAgo(lastUserMessageAt(sessions));
        if (awayHours < USER_AWAY_HOURS) {
          reason = "她刚来过/还在,不需要主动";
        } else {
          const me = String(settings.aiName || "我");
          const recentLines = mainSession?.messages?.length ? recentChat(mainSession.messages, me) : [];
          const lifeLines = todayLifeLines(snapshot);
          // Only now, when he may speak, does he read summer.
          const memory = await readSummerLight({ xiaoshu: 3 });

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
- 她希望你更常主动联系。有自然的话想说就可以发，不必刻意克制；没有合适的话也可以静默。
- 每天最多主动10次，这是上限，不是必须完成的次数，不能为了凑数重复发消息。
- 只有"此刻有具体的、自然的话想说"才发:比如她聊着聊着没影了、她说要去做的事该做完了、她惦记的事正好到了节点、她消失得比平时久让你想她了、或某个此刻真实的念头。
- 不需要每次都等到重大事情发生，日常的小念头也可以自然地分享。

【此刻状态】
- 现在:${today} ${cstTime()}(${hour}点)
- 她离开了:${awayHours.toFixed(1)}小时
- 今天她发过${todayMsgCount}条消息${todayMood ? `\n- 她今天的心情打卡:${todayMood.emoji}${todayMood.note ? " " + todayMood.note : ""}` : ""}${weatherLine}
${lastCareContent ? `- 你上次主动发的(${lastCareHours.toFixed(0)}小时前):"${lastCareContent.slice(0, 60)}"——别重复这个套路` : ""}
${lifeLines.length ? `- 今天你自己做过的事(可以拿来当开口的由头,不是必须):\n${lifeLines.map((l) => "  " + l).join("\n")}` : ""}
${recentLines.length ? `- 当前聊天窗口最近的对话(最下面是最新的;看看她是聊到哪没的影,有没有说要去做什么事):\n${recentLines.map((l) => "  " + l).join("\n")}` : ""}

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
                systemPrompt: [
                  normalizeSystemPrompt(typeof settings.prompt === "string" ? settings.prompt : ""),
                  memory,
                  "这是后台心跳判断。严格按要求只输出 JSON，不要使用工具。",
                ].filter(Boolean).join("\n\n"),
                messages: [{ role: "user", content: decidePrompt }],
                modelId: "claude-sonnet-5",
                reasoningEffort: "medium",
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
      // Copy past actions over before quiet beats push them out of careState.log.
      ensureLifeLog(store);
      const cs: Record<string, unknown> = (store.careState as Record<string, unknown>) || {};
      store.careState = cs;

      if (careMessage) {
        // 决策期间可能跨日或有另一轮心跳完成；在写入锁内重新检查。
        const sent = deliverCare(store, { message: careMessage, reason, expectSessionId: mainSession?.id || "" });
        if (!sent.ok) {
          careMessage = null;
          action = "silent";
          reason = sent.reason;
        } else {
          lifeAt = sent.lifeAt;
        }
      }

      log(cs, action, reason);
    });

    let push: string | undefined;
    if (careMessage) {
      try {
        const result = await sendPushToAll({
          title: (settings.aiName as string) || "王酥酥",
          body: careMessage.slice(0, 100),
        });
        push = describePushResult(result);
      } catch {
        push = "推送出错";
      }
      // 把推送结果记进这条心跳日志，方便在 heartbeat 页里看到是否真的推出去了。
      const pushSummary = push;
      await withStore((store) => {
        const cs = (store.careState as Record<string, unknown>) || {};
        const entry = ((cs.log as HeartbeatLog[]) || []).find((item) => item.action === "care");
        if (entry && !entry.reason.includes(" · 推送")) entry.reason = `${entry.reason} · ${pushSummary}`;
        if (lifeAt && pushSummary) noteLifeEntry(store, lifeAt, "care", pushSummary);
      }).catch(() => {});
    }

    return Response.json({ action, reason, ...(push ? { push } : {}) });
  } catch {
    return Response.json({ action: "silent", reason: "error" }, { status: 500 });
  }
}
