"use client";

export type CacheStats = {
  prompt_tokens?: number;
  total_input_tokens?: number;
  cache_read?: number;
  cache_write?: number;
  status?: "hit" | "write" | "miss" | "unknown";
  reason?: string;
  context_messages?: number;
  context_user_turns?: number;
  context_chars?: number;
  context_window_rounds?: number;
  context_truncated?: boolean;
  context_omitted_messages?: number;
  summary_used?: boolean;
  summer_used?: boolean;
  time?: string;
};

function getCacheStatusLabel(cache: CacheStats) {
  if (cache.status === "hit") return "本轮读取了缓存";
  if (cache.status === "write") return "本轮写入了缓存";
  if (cache.status === "miss") return "本轮未命中";
  return "暂时没有命中信息";
}

function getCacheStatusColor(cache: CacheStats) {
  if (cache.status === "hit") return "#5b8a6b";
  if (cache.status === "write") return "#c4866c";
  if (cache.status === "miss") return "#b58a6a";
  return "#9b918b";
}

export function CacheStatusPanel({ cache }: { cache: CacheStats | null }) {
  const totalInputTokens = cache?.total_input_tokens ?? (
    cache ? (cache.prompt_tokens ?? 0) + (cache.cache_read ?? 0) + (cache.cache_write ?? 0) : 0
  );
  const hitRate = cache && totalInputTokens > 0
    ? Math.round(((cache.cache_read ?? 0) / totalInputTokens) * 100)
    : 0;

  return (
    <div className="settings-group">
      <h2 className="settings-group-title">缓存命中</h2>
      {cache ? (
        <div style={{ fontSize: "13px", color: "#6b5b53", lineHeight: 2 }}>
          <div>状态:<span style={{ marginLeft: "8px", color: getCacheStatusColor(cache) }}>{getCacheStatusLabel(cache)}</span></div>
          {cache.reason && <div>说明:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{cache.reason}</span></div>}
          <div>summer:<span style={{ marginLeft: "8px", color: cache.summer_used ? "#5b8a6b" : "#b5aca6" }}>{cache.summer_used ? "已接管长期记忆" : "未接入"}</span></div>
          {typeof cache.context_messages === "number" && (
            <div>本轮上下文:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>
              {cache.context_messages} 条 / {cache.context_user_turns ?? 0} 轮用户 / 窗口 {cache.context_window_rounds ?? 30} 轮
            </span></div>
          )}
          <div>截断:<span style={{ marginLeft: "8px", color: cache.context_truncated ? "#c4866c" : "#5b8a6b" }}>
            {cache.context_truncated ? `是，省略 ${cache.context_omitted_messages ?? 0} 条更早消息` : "否"}
          </span></div>
          <div>输入总 token:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{totalInputTokens || cache.prompt_tokens || "-"}</span></div>
          {cache.time && <div>上次回复:<span style={{ marginLeft: "8px", color: "#8a7d75" }}>{cache.time}</span></div>}
          <div>读取缓存:<span style={{ marginLeft: "8px", color: (cache.cache_read ?? 0) > 0 ? "#5b8a6b" : "#b5aca6" }}>{cache.cache_read ?? 0}</span></div>
          <div>写入缓存:<span style={{ marginLeft: "8px", color: "#a09088" }}>{cache.cache_write ?? 0}</span></div>
          {(cache.cache_read ?? 0) > 0 && totalInputTokens > 0 && (
            <div style={{ marginTop: "4px", color: "#c4866c" }}>
              命中率约 {hitRate}%
              <div style={{ color: "#8a7d75" }}>读取/总输入: {cache.cache_read ?? 0}/{totalInputTokens}</div>
            </div>
          )}
          <p className="settings-hint" style={{ marginTop: "6px" }}>
            这里显示 API 返回的原始 token。OpenRouter 控制台按计费口径统计，数字可能不同。
          </p>
        </div>
      ) : (
        <p className="settings-hint">还没有数据，发一条消息后再看。</p>
      )}
    </div>
  );
}
