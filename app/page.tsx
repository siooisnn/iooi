"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NextImage from "next/image";
import { GroupChatView } from "./components/GroupChatView";
import { useThemePage } from "./components/ThemeProvider";
import { useFullscreenShell } from "./lib/use-fullscreen-shell";
import { DEFAULT_GPT_MODEL, resolveGptModel } from "./lib/gpt-models";
import type { AssistantMode, CacheStats, ChatListTab, ChatSession, FragmentEntry, Message, Mood } from "./lib/app-types";
import { CLAUDE_DEFAULT_NAME, DEFAULT_PROMPT, MODELS, normalizeClaudeSettings } from "./lib/app-settings";
import type { Settings } from "./lib/app-settings";
import { createGroupSession, ensureMemoSession, genId, mergeChatMessages, mergeChatSessionLists, mergeFragments } from "./lib/chat-sessions";
import { apiFetch, fetchFromServer, fetchGptFromServer, fetchGroupFromServer, getToken, loadLocal, loadLocalRaw, saveLocal, syncGptToServer, syncGroupToServer, syncToServer } from "./lib/client-api";
import { IconChat, IconDiary, IconHome, IconSettings } from "./components/NavIcons";
import { ChatListView } from "./components/ChatListView";
import { HomeView } from "./components/HomeView";
import { ChatView } from "./components/ChatView";
import { SummerPageView } from "./components/SummerPageView";
import { SettingsView } from "./components/SettingsView";

// Main App
export default function Home() {
  const defaultSettings: Settings = {
    model: "sonnet5",
    gptModel: DEFAULT_GPT_MODEL.id,
    chatEntryStyle: "list",
    classicChatBackground: "",
    todayState: "",
    bubbleColor: "gray",
    chatPinnedLine: "此后我们的每一秒都是恩赐。",
    gptChatPinnedLine: "此后我们的每一秒都是恩赐。",
    aiName: CLAUDE_DEFAULT_NAME,
    gptName: "GPT",
    userName: "宝宝",
    prompt: DEFAULT_PROMPT,
    startDate: "2026-04-01",
    aiAvatar: "",
    gptAvatar: "",
    userAvatar: "",
    gptReasoningEffort: "medium",
    claudeReasoningEffort: "high",
    gptWebSearch: false,
    thinking: true,
    webSearch: false,
    proactiveCare: false,
    city: "",
  };

  const [tab, setTab] = useState<"home" | "chat" | "diary" | "settings">("home");
  useThemePage(tab);
  const [chatView, setChatView] = useState<"list" | "room" | "group">("list");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const chatRoomOpen = tab === "chat" && chatView !== "list";
  const shellRef = useRef<HTMLDivElement>(null);
  const activeChatBackground = chatRoomOpen ? settings.classicChatBackground || "" : "";
  // Which private room is open. Either person's room can be opened from
  // the list, whichever person the A/B switch currently shows.
  const [roomMode, setRoomMode] = useState<AssistantMode>("claude");
  const [listTab, setListTab] = useState<ChatListTab>("chats");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [gptSessions, setGptSessions] = useState<ChatSession[]>([]);
  const [gptActiveSessionId, setGptActiveSessionId] = useState<string>("");
  const [groupSessions, setGroupSessions] = useState<ChatSession[]>(() => [createGroupSession()]);
  const [groupActiveSessionId, setGroupActiveSessionId] = useState("group-main");
  const [moods, setMoods] = useState<Mood[]>([]);
  const [fragments, setFragments] = useState<FragmentEntry[]>([]);
  const [heartbeatLog, setHeartbeatLog] = useState<Array<{ time: string; action: string; reason: string }>>([]);
  const [aiMood, setAiMood] = useState<{ emoji: string; ts: number }>(() =>
    loadLocalRaw<{ emoji: string; ts: number }>("iooi-ai-mood", { emoji: "", ts: 0 })
  );
  const [lastCache, setLastCache] = useState<CacheStats | null>(() =>
    loadLocalRaw<CacheStats | null>("iooi-last-cache", null)
  );
  const [gptLastCache, setGptLastCache] = useState<CacheStats | null>(() =>
    loadLocalRaw<CacheStats | null>("iooi-gpt-last-cache", null)
  );
  const [needKey, setNeedKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [mounted, setMounted] = useState(false);
  // The shell div only exists once the app is unlocked and mounted.
  useFullscreenShell(mounted && !needKey && !chatRoomOpen, shellRef);
  const deletedSessionIds = useRef<Set<string>>(new Set(loadLocalRaw<string[]>("iooi-deleted-session-ids", [])));
  const gptDeletedSessionIds = useRef<Set<string>>(new Set(loadLocalRaw<string[]>("iooi-gpt-deleted-session-ids", [])));

  useEffect(() => {
    async function init() {
      // Try server first, fall back to localStorage
      const [serverData, gptServerData, groupServerData] = await Promise.all([
        fetchFromServer(),
        fetchGptFromServer(),
        fetchGroupFromServer(),
      ]);

      if (serverData === "unauthorized" || gptServerData === "unauthorized" || groupServerData === "unauthorized") {
        setNeedKey(true);
        return;
      }

      let s: Settings;
      let sess: ChatSession[];
      if (serverData && (serverData.sessions?.length > 0 || serverData.settings || Array.isArray(serverData.fragments))) {
        if (Array.isArray(serverData.deletedSessionIds)) {
          deletedSessionIds.current = new Set([...deletedSessionIds.current, ...serverData.deletedSessionIds]);
          saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
        }
        s = normalizeClaudeSettings(
          serverData.settings ? { ...defaultSettings, ...serverData.settings } : loadLocal("iooi-settings", defaultSettings)
        );
        const localSessions = loadLocalRaw<ChatSession[]>("iooi-sessions", []);
        sess = mergeChatSessionLists(localSessions, serverData.sessions || [], deletedSessionIds.current);
        setMoods(serverData.moods || loadLocalRaw<Mood[]>("iooi-moods", []));
        setFragments(mergeFragments(
          loadLocalRaw<FragmentEntry[]>("iooi-fragments", []),
          Array.isArray(serverData.fragments) ? serverData.fragments : [],
        ));
        setHeartbeatLog(serverData.careState?.log || []);
        setAiMood(serverData.aiMood || loadLocalRaw<{ emoji: string; ts: number }>("iooi-ai-mood", { emoji: "", ts: 0 }));
        setLastCache(serverData.lastCache || loadLocalRaw<CacheStats | null>("iooi-last-cache", null));
      } else {
        s = normalizeClaudeSettings({ ...defaultSettings, ...loadLocal("iooi-settings", defaultSettings) });
        sess = mergeChatSessionLists(
          loadLocalRaw<ChatSession[]>("iooi-sessions", []),
          [],
          deletedSessionIds.current,
        );
        setMoods(loadLocalRaw<Mood[]>("iooi-moods", []));
        setFragments(loadLocalRaw<FragmentEntry[]>("iooi-fragments", []));
      }

      if (gptServerData && Array.isArray(gptServerData.deletedSessionIds)) {
        gptDeletedSessionIds.current = new Set([
          ...gptDeletedSessionIds.current,
          ...gptServerData.deletedSessionIds,
        ]);
        saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
      }
      const localGptSessions = loadLocalRaw<ChatSession[]>("iooi-gpt-sessions", []);
      const mergedGptSessions = mergeChatSessionLists(
        localGptSessions,
        gptServerData && Array.isArray(gptServerData.sessions) ? gptServerData.sessions : [],
        gptDeletedSessionIds.current,
      );
      if (gptServerData && gptServerData.lastCache) {
        setGptLastCache(gptServerData.lastCache);
      }

      const legacyGroupSession = loadLocalRaw<ChatSession | null>("iooi-group-session", null);
      const localGroupSessions = loadLocalRaw<ChatSession[]>(
        "iooi-group-sessions",
        legacyGroupSession ? [legacyGroupSession] : [],
      );
      const serverGroupSessions = groupServerData && Array.isArray(groupServerData.sessions)
        ? groupServerData.sessions as ChatSession[]
        : [];
      const mergedGroupSessions = mergeChatSessionLists(
        localGroupSessions,
        serverGroupSessions,
        new Set<string>(),
      );
      const normalizedGroupSessions = (mergedGroupSessions.length > 0 ? mergedGroupSessions : [createGroupSession()])
        .map((group, index) => ({
          ...group,
          name: group.name === "一个群" ? `群聊 ${index + 1}` : (group.name || `群聊 ${index + 1}`),
          kind: "group" as const,
          messages: mergeChatMessages([], group.messages || []),
        }));

      setSettings(s);
      saveLocal("iooi-settings", s);
      syncToServer({ settings: s });
      let initialSessions = sess;
      let initialActiveSessionId = sess[0]?.id || "";
      if (initialSessions.length === 0) {
        const first: ChatSession = { id: genId(), name: "对话 1", messages: [], createdAt: new Date().toISOString() };
        initialSessions = [first];
        initialActiveSessionId = first.id;
      }
      setSessions(ensureMemoSession(initialSessions));
      setActiveSessionId(initialActiveSessionId);
      if (mergedGptSessions.length === 0) {
        const firstGpt: ChatSession = { id: `gpt-${genId()}`, name: "GPT 对话 1", messages: [], createdAt: new Date().toISOString() };
        setGptSessions([firstGpt]);
        setGptActiveSessionId(firstGpt.id);
      } else {
        setGptSessions(mergedGptSessions);
        setGptActiveSessionId(mergedGptSessions[0].id);
      }
      setGroupSessions(normalizedGroupSessions);
      setGroupActiveSessionId(normalizedGroupSessions[0].id);
      setMounted(true);
    }
    init();
  }, []);

  // Register service worker
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(async (reg) => {
          // 每次打开都把当前订阅同步给服务器：iOS 可能已更换推送端点，服务器端旧的会在推送时被清理。
          if (!("PushManager" in window) || !("Notification" in window) || Notification.permission !== "granted") return;
          const sub = await reg.pushManager.getSubscription();
          if (!sub) return;
          await apiFetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub.toJSON()),
          });
        })
        .catch(() => {});
    }
  }, [mounted]);

  // Her bubble colour lives on <html> so every chat view picks it up.
  useEffect(() => {
    document.documentElement.dataset.bubble = settings.bubbleColor;
  }, [settings.bubbleColor]);

  // Force sync when user switches away (prevents message loss on iOS)
  const latestData = useRef({ sessions, gptSessions, groupSessions, settings, moods, fragments });
  useEffect(() => {
    latestData.current = { sessions, gptSessions, groupSessions, settings, moods, fragments };
  }, [sessions, gptSessions, groupSessions, settings, moods, fragments]);
  useEffect(() => {
    if (!mounted) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        const d = latestData.current;
        saveLocal("iooi-sessions", d.sessions);
        saveLocal("iooi-settings", d.settings);
        // Sync to server immediately (bypass debounce)
        try {
          navigator.sendBeacon("/api/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: d.sessions, deletedSessionIds: Array.from(deletedSessionIds.current), settings: d.settings, moods: d.moods, fragments: d.fragments })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: d.sessions, deletedSessionIds: Array.from(deletedSessionIds.current), settings: d.settings, moods: d.moods, fragments: d.fragments }),
            keepalive: true,
          }).catch(() => {});
        }
        saveLocal("iooi-gpt-sessions", d.gptSessions);
        try {
          navigator.sendBeacon("/api/gpt/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: d.gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/gpt/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: d.gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) }),
            keepalive: true,
          }).catch(() => {});
        }
        saveLocal("iooi-group-sessions", d.groupSessions);
        try {
          navigator.sendBeacon("/api/group/sync?t=" + encodeURIComponent(getToken()), new Blob(
            [JSON.stringify({ sessions: d.groupSessions })],
            { type: "application/json" }
          ));
        } catch {
          apiFetch("/api/group/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessions: d.groupSessions }),
            keepalive: true,
          }).catch(() => {});
        }
      } else if (document.visibilityState === "visible") {
        // 切回前台:拉服务器数据,捞回服务端落地的消息(防止state覆盖丢失)
        apiFetch("/api/sync")
          .then((r) => r.json())
          .then((server) => {
            if (!server) return;
            if (Array.isArray(server.deletedSessionIds)) {
              deletedSessionIds.current = new Set([
                ...deletedSessionIds.current,
                ...server.deletedSessionIds,
              ]);
              saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
            }
            if (Array.isArray(server.sessions)) {
              setSessions((local) =>
                mergeChatSessionLists(local, server.sessions, deletedSessionIds.current)
              );
            }
            if (Array.isArray(server.fragments)) {
              setFragments((local) => mergeFragments(local, server.fragments));
            }
          })
          .catch(() => {});
        apiFetch("/api/gpt/sync")
          .then((res) => res.json())
          .then((server) => {
            if (!server) return;
            if (Array.isArray(server.deletedSessionIds)) {
              gptDeletedSessionIds.current = new Set([
                ...gptDeletedSessionIds.current,
                ...server.deletedSessionIds,
              ]);
              saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
            }
            if (Array.isArray(server.sessions)) {
              setGptSessions((local) =>
                mergeChatSessionLists(local, server.sessions, gptDeletedSessionIds.current)
              );
            }
          })
          .catch(() => {});
        apiFetch("/api/group/sync")
          .then((res) => res.json())
          .then((server) => {
            if (!Array.isArray(server?.sessions)) return;
            setGroupSessions((local) => mergeChatSessionLists(
              local,
              server.sessions as ChatSession[],
              new Set<string>(),
            ).map((group, index) => ({
              ...group,
              name: group.name === "一个群" ? `群聊 ${index + 1}` : (group.name || `群聊 ${index + 1}`),
              kind: "group" as const,
            })));
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-sessions", sessions);
      syncToServer({ sessions, deletedSessionIds: Array.from(deletedSessionIds.current) });
    }
  }, [sessions, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-gpt-sessions", gptSessions);
      syncGptToServer({ sessions: gptSessions, deletedSessionIds: Array.from(gptDeletedSessionIds.current) });
    }
  }, [gptSessions, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-group-sessions", groupSessions);
      syncGroupToServer({ sessions: groupSessions });
    }
  }, [groupSessions, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-moods", moods);
      syncToServer({ moods });
    }
  }, [moods, mounted]);

  useEffect(() => {
    if (mounted) {
      saveLocal("iooi-fragments", fragments);
      syncToServer({ fragments });
    }
  }, [fragments, mounted]);

  useEffect(() => {
    if (mounted && aiMood.emoji) {
      saveLocal("iooi-ai-mood", aiMood);
      syncToServer({ aiMood });
    }
  }, [aiMood, mounted]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveLocal("iooi-settings", next);
      syncToServer({ settings: next });
      return next;
    });
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const gptActiveSession = gptSessions.find((s) => s.id === gptActiveSessionId);

  const updateActiveMessages = useCallback((updater: (msgs: Message[]) => Message[]) => {
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: updater(s.messages) } : s));
  }, [activeSessionId]);

  const updateActiveSummary = useCallback((summary: string, until: number) => {
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, summary, summarizedUntil: until } : s));
  }, [activeSessionId]);

  const createSession = useCallback(() => {
    const existingDraft = sessions.find((session) => session.kind !== "memo" && session.messages.length === 0);
    if (existingDraft) {
      setActiveSessionId(existingDraft.id);
      return;
    }
    const normalCount = sessions.filter((s) => s.kind !== "memo").length;
    const newSession: ChatSession = {
      id: genId(),
      name: `对话 ${normalCount + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  }, [sessions]);

  const deleteSession = useCallback((id: string) => {
    deletedSessionIds.current.add(id);
    saveLocal("iooi-deleted-session-ids", Array.from(deletedSessionIds.current));
    setSessions((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.kind === "memo") return prev; // 备忘不可删
      const next = prev.filter((s) => s.id !== id);
      const normals = next.filter((s) => s.kind !== "memo");
      if (normals.length === 0) {
        const fresh: ChatSession = { id: genId(), name: "对话 1", messages: [], createdAt: new Date().toISOString() };
        setActiveSessionId(fresh.id);
        return [...next, fresh];
      }
      if (id === activeSessionId) setActiveSessionId(normals[0].id);
      return next;
    });
  }, [activeSessionId]);

  const renameSession = useCallback((id: string, name: string) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
  }, []);

  const updateGptMessages = useCallback((updater: (messages: Message[]) => Message[]) => {
    setGptSessions((prev) => prev.map((session) =>
      session.id === gptActiveSessionId ? { ...session, messages: updater(session.messages) } : session
    ));
  }, [gptActiveSessionId]);

  const updateGroupMessages = useCallback((updater: (messages: Message[]) => Message[]) => {
    setGroupSessions((current) => current.map((group) => group.id === groupActiveSessionId
      ? { ...group, messages: updater(group.messages) }
      : group));
  }, [groupActiveSessionId]);

  const updateGroupSummary = useCallback((summary: string, until: number) => {
    setGroupSessions((current) => current.map((group) => group.id === groupActiveSessionId
      ? { ...group, summary, summarizedUntil: until }
      : group));
  }, [groupActiveSessionId]);

  const createGroupSessionWindow = useCallback(() => {
    const nextId = `group-${genId()}`;
    setGroupSessions((current) => [createGroupSession(current.length + 1, nextId), ...current]);
    setGroupActiveSessionId(nextId);
  }, []);

  const updateGptSummary = useCallback((summary: string, until: number) => {
    setGptSessions((prev) => prev.map((session) =>
      session.id === gptActiveSessionId ? { ...session, summary, summarizedUntil: until } : session
    ));
  }, [gptActiveSessionId]);

  const createGptSession = useCallback(() => {
    const existingDraft = gptSessions.find((session) => session.messages.length === 0);
    if (existingDraft) {
      setGptActiveSessionId(existingDraft.id);
      return;
    }
    const next: ChatSession = {
      id: `gpt-${genId()}`,
      name: `GPT 对话 ${gptSessions.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setGptSessions((prev) => [next, ...prev]);
    setGptActiveSessionId(next.id);
  }, [gptSessions]);

  const deleteGptSession = useCallback((id: string) => {
    gptDeletedSessionIds.current.add(id);
    saveLocal("iooi-gpt-deleted-session-ids", Array.from(gptDeletedSessionIds.current));
    setGptSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== id);
      if (remaining.length === 0) {
        const fresh: ChatSession = { id: `gpt-${genId()}`, name: "GPT 对话 1", messages: [], createdAt: new Date().toISOString() };
        setGptActiveSessionId(fresh.id);
        return [fresh];
      }
      if (id === gptActiveSessionId) setGptActiveSessionId(remaining[0].id);
      return remaining;
    });
  }, [gptActiveSessionId]);

  const renameGptSession = useCallback((id: string, name: string) => {
    setGptSessions((prev) => prev.map((session) => session.id === id ? { ...session, name } : session));
  }, []);

  const groupSession = groupSessions.find((group) => group.id === groupActiveSessionId)
    || groupSessions[0]
    || createGroupSession();

  if (!mounted && !needKey) return <main className="app-bg"><div className="chat-container" /></main>;

  const tabs = [
    { id: "home" as const, label: "Home", Icon: IconHome },
    { id: "chat" as const, label: "Chat", Icon: IconChat },
    { id: "diary" as const, label: "Summer", Icon: IconDiary },
    { id: "settings" as const, label: "Settings", Icon: IconSettings },
  ];

  function switchTab(nextTab: "home" | "chat" | "diary" | "settings") {
    setTab(nextTab);
    if (nextTab === "chat") {
      setChatView("list");
    }
  }

  if (needKey) {
    return (
      <main className="app-bg">
        <div className="lock-screen">
          <img src="/icon-bear-192.png" alt="" className="lock-icon" />
          <p className="lock-title">这是我们的小窗</p>
          <p className="lock-sub">输入钥匙进门</p>
          <input
            className="modal-input lock-input"
            type="password"
            placeholder="钥匙"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keyInput.trim()) {
                localStorage.setItem("iooi-token", keyInput.trim());
                location.reload();
              }
            }}
          />
          <button
            className="modal-save lock-btn"
            disabled={!keyInput.trim()}
            onClick={() => {
              localStorage.setItem("iooi-token", keyInput.trim());
              location.reload();
            }}
          >进门</button>
        </div>
      </main>
    );
  }

  const listMode: AssistantMode = settings.chatEntryStyle === "direct" ? "gpt" : "claude";
  const chatListOpen = tab === "chat" && chatView === "list";

  function openPrivateRoom(mode: AssistantMode, id: string) {
    if (mode === "gpt") setGptActiveSessionId(id);
    else setActiveSessionId(id);
    setRoomMode(mode);
    setChatView("room");
  }

  function openGroupRoom(id: string) {
    setGroupActiveSessionId(id);
    setChatView("group");
  }

  function openNewGroupRoom() {
    createGroupSessionWindow();
    setChatView("group");
  }

  // The round + beside the tab bar only acts on the chat list; on the other
  // pages it is just part of the bar's shape.
  function openNewPrivateRoom() {
    if (!chatListOpen) return;
    if (listMode === "gpt") createGptSession();
    else createSession();
    setRoomMode(listMode);
    setChatView("room");
  }

  return (
    <main className="app-bg"
      data-fullscreen-shell={tab === "chat" && chatView !== "list" ? undefined : "true"}>
      <div
        ref={shellRef}
        className="chat-container"
        data-chat-view={tab === "chat" ? chatView : undefined}
        data-chat-ui={tab === "chat" && chatView === "room" ? "default" : undefined}
        data-chat-background={activeChatBackground ? "image" : undefined}
      >
        {activeChatBackground && (
          <NextImage className="chat-room-background" src={activeChatBackground} alt="" fill unoptimized aria-hidden="true" />
        )}
        {tab === "home" && <HomeView settings={settings} />}
        {chatListOpen && (
          <ChatListView
            key={listMode}
            assistantMode={listMode}
            settings={settings}
            updateSettings={updateSettings}
            sessions={listMode === "gpt" ? gptSessions : sessions}
            otherSessions={listMode === "gpt" ? sessions : gptSessions}
            groupSessions={groupSessions}
            heartbeatLog={listMode === "gpt" ? [] : heartbeatLog}
            fragments={fragments}
            setFragments={setFragments}
            renameSession={listMode === "gpt" ? renameGptSession : renameSession}
            deleteSession={listMode === "gpt" ? deleteGptSession : deleteSession}
            openSession={openPrivateRoom}
            openGroup={openGroupRoom}
            createGroup={openNewGroupRoom}
            listTab={listTab}
            setListTab={setListTab}
          />
        )}
        {tab === "chat" && roomMode === "claude" && activeSession && chatView === "room" && (
          <ChatView
            key={`claude-${activeSession.id}`}
            assistantMode="claude"
            settings={settings}
            session={activeSession}
            sessions={sessions}
            updateMessages={updateActiveMessages}
            updateSummary={updateActiveSummary}
            updateSettings={updateSettings}
            setLastCache={setLastCache}
            setAiMood={setAiMood}
            aiMood={aiMood}
            setActiveSessionId={setActiveSessionId}
            createSession={createSession}
            deleteSession={deleteSession}
            renameSession={renameSession}
            listEntryMode
            onBackToList={() => setChatView("list")}
          />
        )}
        {tab === "chat" && roomMode === "gpt" && gptActiveSession && chatView === "room" && (
          <ChatView
            key={`gpt-${gptActiveSession.id}`}
            assistantMode="gpt"
            settings={settings}
            session={gptActiveSession}
            sessions={gptSessions}
            updateMessages={updateGptMessages}
            updateSummary={updateGptSummary}
            updateSettings={updateSettings}
            setLastCache={setGptLastCache}
            setAiMood={() => {}}
            aiMood={{ emoji: "", ts: 0 }}
            setActiveSessionId={setGptActiveSessionId}
            createSession={createGptSession}
            deleteSession={deleteGptSession}
            renameSession={renameGptSession}
            listEntryMode
            onBackToList={() => setChatView("list")}
          />
        )}
        {tab === "chat" && chatView === "group" && (
          <GroupChatView
            key={`group-${groupSession.id}`}
            session={groupSession}
            settings={settings}
            claudeModelId={(MODELS.find((model) => model.id === settings.model) || MODELS[0]).apiId}
            gptModelId={resolveGptModel(settings.gptModel).apiId}
            updateSettings={updateSettings}
            updateMessages={updateGroupMessages}
            updateSummary={updateGroupSummary}
            onBack={() => setChatView("list")}
          />
        )}
        {tab === "diary" && (
          <SummerPageView
            key={settings.chatEntryStyle}
            assistantMode={listMode}
            assistantName={listMode === "gpt" ? "GPT" : (settings.aiName || CLAUDE_DEFAULT_NAME)}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            settings={settings}
            updateSettings={updateSettings}
            updateSummary={listMode === "gpt" ? updateGptSummary : updateActiveSummary}
            lastCache={listMode === "gpt" ? gptLastCache : lastCache}
            session={listMode === "gpt" ? gptActiveSession : activeSession}
            assistantMode={listMode}
          />
        )}

        {!(tab === "chat" && chatView !== "list") && <nav className="bottom-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-btn ${tab === t.id ? "nav-btn-active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => switchTab(t.id)}
            >
              <t.Icon active={tab === t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>}
        {!(tab === "chat" && chatView !== "list") && (
          <button
            type="button"
            className="bottom-nav-plus"
            aria-label={chatListOpen ? `新开${listMode === "gpt" ? settings.gptName || "GPT" : settings.aiName || CLAUDE_DEFAULT_NAME}窗口` : undefined}
            aria-hidden={chatListOpen ? undefined : true}
            tabIndex={chatListOpen ? undefined : -1}
            onClick={openNewPrivateRoom}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </main>
  );
}
