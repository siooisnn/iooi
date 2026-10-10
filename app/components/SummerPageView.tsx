"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssistantMode, SummerMemoryItem, SummerState, SummerWritableLayer } from "../lib/app-types";
import { apiFetchWithTimeout, arrayBufferToBase64 } from "../lib/client-api";
import { PageBack } from "./PageBack";

export function layerLabel(layer: string) {
  const labels: Record<string, { title: string; sub: string }> = {
    lixia: { title: "Beginning of Summer", sub: "立夏" },
    xiaoman: { title: "Grain Buds", sub: "小满" },
    mangzhong: { title: "Grain in Ear", sub: "芒种" },
    xiazhi: { title: "Summer Solstice", sub: "夏至" },
    xiaoshu: { title: "Minor Heat", sub: "小暑" },
    rain: { title: "rain", sub: "未了结" },
    ferry: { title: "ferry", sub: "渡口" },
    sea: { title: "sea", sub: "只读" },
  };
  return labels[layer]?.title || layer;
}

export function layerSub(layer: string) {
  const labels: Record<string, string> = {
    lixia: "立夏",
    xiaoman: "小满",
    mangzhong: "芒种",
    xiazhi: "夏至",
    xiaoshu: "小暑",
    rain: "小雨淅淅沥沥",
    ferry: "上一秒在这里，下一秒在那里",
    sea: "海不会跑掉，我也不会",
  };
  return labels[layer] || "";
}

export function splitMangzhongDocs(content: string) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const docs: { title: string; content: string }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,2}\s+/.test(line)) {
      if (currentTitle) {
        docs.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = line.replace(/^#{1,2}\s+/, "").trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    docs.push({ title: currentTitle, content: currentLines.join("\n").trim() });
  }
  return docs;
}

const SUMMER_FOLDERS: Record<string, string> = {
  lixia: "立夏", xiaoman: "小满", mangzhong: "芒种", xiazhi: "夏至",
  xiaoshu: "小暑", rain: "rain", ferry: "ferry", sea: "sea",
};

function SummerFolderIcon() {
  return (
    <svg className="xp-summer-folder-icon" viewBox="0 0 32 28" aria-hidden="true">
      <path d="M2 6V3h10l3 3h15v19H2z" fill="#e8b74f" stroke="#a77522" />
      <path d="M2 9h28l-2 16H4z" fill="#ffdc79" stroke="#a77522" />
      <path d="M4 11h23" stroke="#fff0b2" strokeWidth="2" />
    </svg>
  );
}

export function SummerMemoryView({ assistantMode, retro = false }: { assistantMode: AssistantMode; retro?: boolean }) {
  const summerEndpoint = assistantMode === "gpt" ? "/api/gpt/summer" : "/api/summer";
  const [state, setState] = useState<SummerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ source?: string; score?: number; text?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [writeLayer, setWriteLayer] = useState<SummerWritableLayer>("xiaoshu");
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeWeight, setWriteWeight] = useState(6);
  const [saving, setSaving] = useState(false);
  const [editingDoc, setEditingDoc] = useState("");
  const [editingItem, setEditingItem] = useState<SummerMemoryItem | null>(null);

  const loadSummer = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 读取失败");
      setState(json.data || {});
      if (activeLayer && ["lixia", "xiaoman", "mangzhong"].includes(activeLayer)) {
        setEditingDoc(json.data?.layers?.[activeLayer] || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 读取失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [activeLayer, summerEndpoint]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadSummer());
    return () => window.cancelAnimationFrame(frame);
  }, [loadSummer]);

  useEffect(() => {
    const refreshVisibleSummer = () => {
      if (document.visibilityState === "visible") void loadSummer(true);
    };
    window.addEventListener("focus", refreshVisibleSummer);
    document.addEventListener("visibilitychange", refreshVisibleSummer);
    return () => {
      window.removeEventListener("focus", refreshVisibleSummer);
      document.removeEventListener("visibilitychange", refreshVisibleSummer);
    };
  }, [loadSummer]);

  async function runSearch() {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(`${summerEndpoint}?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 检索失败");
      setHits((json.data?.results || json.data?.hits || []).map((hit: { layer?: string; source?: string; score?: number; title?: string; content?: string; text?: string }) => ({
        source: hit.layer || hit.source,
        score: hit.score,
        text: hit.text || [hit.title, hit.content].filter(Boolean).join("\n"),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 检索失败");
    } finally {
      setSearching(false);
    }
  }

  async function submitMemory() {
    if (!writeContent.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layer: writeLayer,
          title: writeTitle.trim(),
          content: writeContent.trim(),
          weight: writeWeight,
          source: "iooi",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 写入失败");
      setWriteTitle("");
      setWriteContent("");
      setWriterOpen(false);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 写入失败");
    } finally {
      setSaving(false);
    }
  }

  function uploadSeaFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx,.txt,.md,.json,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        setError("sea 原文件不能超过 10 MB");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const res = await apiFetchWithTimeout(summerEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sea_file",
            title: file.name.replace(/\.[^.]+$/, ""),
            filename: file.name,
            content_type: file.type,
            data_base64: arrayBufferToBase64(await file.arrayBuffer()),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "sea 上传失败");
        void loadSummer(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "sea 上传失败");
      } finally {
        setSaving(false);
      }
    };
    input.click();
  }

  async function saveLayerDoc(layer: string) {
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "layer", layer, content: editingDoc }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 保存失败");
      setState((current) => current ? {
        ...current,
        layers: { ...(current.layers || {}), [layer]: editingDoc },
      } : current);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(layer: string, item: SummerMemoryItem) {
    if (!item.id) return;
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "item",
          layer,
          id: item.id,
          patch: {
            title: item.title || "",
            content: item.content || "",
            weight: item.weight,
            status: item.status,
            due: item.due,
            filename: item.filename,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 保存失败");
      setEditingItem(null);
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(layer: string, item: SummerMemoryItem) {
    if (!item.id || !confirm("确定删除这条吗？")) return;
    if (layer === "sea") {
      setError(`${layerLabel(layer)} 是只读层`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetchWithTimeout(summerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "item", layer, id: item.id, actionType: "delete" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "summer 删除失败");
      void loadSummer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "summer 删除失败");
    } finally {
      setSaving(false);
    }
  }

  const layers = state?.layers || {};
  const xiazhi = state?.xiazhi || [];
  const orderedXiazhi = xiazhi.slice().reverse();
  const highWeightXiazhi = orderedXiazhi.filter((item) => Number(item.weight ?? 5) >= 6);
  const lowWeightXiazhi = orderedXiazhi.filter((item) => Number(item.weight ?? 5) < 6);
  const xiaoshu = (state?.xiaoshu_tail || []).slice().reverse();
  const rain = state?.rain || [];
  const openRain = rain.filter((item) => item.status !== "closed");
  const closedRain = rain.filter((item) => item.status === "closed");
  const ferry = state?.ferry || [];
  const seaFiles = state?.sea_files || state?.sunny_files || state?.sunny?.days || [];
  const layerOrder = ["lixia", "xiaoman", "mangzhong", "xiazhi", "xiaoshu", "rain", "ferry", "sea"];
  const mangzhongDocs = splitMangzhongDocs(layers.mangzhong || "");
  const sectionItems: Record<string, SummerMemoryItem[]> = {
    xiazhi: orderedXiazhi,
    xiaoshu,
    rain,
    ferry,
    sea: seaFiles.slice().reverse(),
  };
  const counts: Record<string, string> = {
    lixia: layers.lixia?.trim() ? "1 篇" : "0",
    xiaoman: layers.xiaoman?.trim() ? "1 篇" : "0",
    mangzhong: `${mangzhongDocs.length || (layers.mangzhong?.trim() ? 1 : 0)} 篇`,
    xiazhi: `≥6 ${highWeightXiazhi.length} 条 · <6 ${lowWeightXiazhi.length} 条`,
    xiaoshu: `${xiaoshu.length} 天`,
    rain: `${openRain.length} 未了结 · ${closedRain.length} 已了结`,
    ferry: `${ferry.length} 条`,
    sea: `${seaFiles.length} 份`,
  };

  function openLayer(layer: string) {
    setActiveLayer(layer);
    setEditingItem(null);
    if (["lixia", "xiaoman", "mangzhong"].includes(layer)) {
      setEditingDoc(layers[layer] || "");
    }
  }

  const content = (
    <>
      <div className="summer-native-toolbar summer-native-toolbar-flat">
        <div>
          {activeLayer ? (
            <>
              <p className="summer-kicker">summer</p>
              <h2>{layerLabel(activeLayer)}</h2>
              <p className="summer-layer-sub">{layerSub(activeLayer)}</p>
            </>
          ) : (
            <h2>sea&amp;rain</h2>
          )}
        </div>
        <div className="summer-toolbar-actions">
          {activeLayer && <button onClick={() => { setActiveLayer(null); setEditingItem(null); }}>返回</button>}
          <button onClick={() => loadSummer()} disabled={loading}>刷新</button>
          {!activeLayer && <button className="summer-primary-btn" onClick={() => setWriterOpen((v) => !v)}>{writerOpen ? "收起" : "写入"}</button>}
          {activeLayer === "sea" && <button className="summer-primary-btn" onClick={uploadSeaFile} disabled={saving}>{saving ? "上传中" : "上传原文件"}</button>}
        </div>
      </div>

      {error && <div className="summer-error">{error}</div>}

      {!activeLayer && <div className="summer-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="检索旧材料"
        />
        <button onClick={runSearch} disabled={searching}>{searching ? "检索中" : "检索"}</button>
      </div>}

      {!activeLayer && writerOpen && (
        <div className="summer-writer">
          <div className="summer-writer-row">
            <label>
              层
              <select value={writeLayer} onChange={(e) => setWriteLayer(e.target.value as SummerWritableLayer)}>
                <option value="mangzhong">mangzhong</option>
                <option value="xiaoshu">xiaoshu</option>
                <option value="xiazhi">xiazhi</option>
                <option value="rain">rain</option>
                <option value="ferry">ferry</option>
              </select>
            </label>
            <label>
              权重
              <input
                type="number"
                min={1}
                max={10}
                value={writeWeight}
                onChange={(e) => setWriteWeight(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
              />
            </label>
          </div>
          <input
            className="summer-title-input"
            value={writeTitle}
            onChange={(e) => setWriteTitle(e.target.value)}
            placeholder="标题，可空"
          />
          <textarea
            value={writeContent}
            onChange={(e) => setWriteContent(e.target.value)}
            placeholder="写给 summer 的内容"
            rows={7}
          />
          <div className="summer-writer-actions">
            <button onClick={() => { setWriteContent(""); setWriteTitle(""); setWriterOpen(false); }}>取消</button>
            <button className="summer-primary-btn" onClick={submitMemory} disabled={saving || !writeContent.trim()}>
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      )}

      {!activeLayer && hits.length > 0 && (
        <section className="summer-section">
          <div className="summer-section-head">
            <h3>检索结果</h3>
            <span>{hits.length} 条</span>
          </div>
          <div className="summer-card-list">
            {hits.map((hit, index) => (
              <article className="summer-memory-card" key={`${hit.source}-${index}`}>
                <div className="summer-card-meta">
                  <span>{hit.source || "summer"}</span>
                  {typeof hit.score === "number" && <span>score {hit.score}</span>}
                </div>
                <p>{hit.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="diary-empty"><p>正在读 summer</p></div>
      ) : activeLayer ? (
        <section className="summer-section">
          {activeLayer === "mangzhong" ? (
            <div className="summer-doc-stack">
              {splitMangzhongDocs(editingDoc || layers.mangzhong || "").map((doc, index) => (
                <details className="summer-doc" key={`${doc.title}-${index}`}>
                  <summary>{doc.title}</summary>
                  <pre>{doc.content}</pre>
                </details>
              ))}
              <details className="summer-doc summer-editor-details">
                <summary>编辑芒种全文</summary>
                <div className="summer-doc-editor">
                  <textarea value={editingDoc} onChange={(e) => setEditingDoc(e.target.value)} rows={20} />
                  <div className="summer-writer-actions">
                    <button onClick={() => setEditingDoc(layers.mangzhong || "")}>还原</button>
                    <button className="summer-primary-btn" onClick={() => saveLayerDoc("mangzhong")} disabled={saving || !editingDoc.trim()}>
                      {saving ? "保存中" : "保存"}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          ) : ["lixia", "xiaoman"].includes(activeLayer) ? (
            <details className="summer-doc summer-editor-details" open={activeLayer !== "mangzhong"}>
              <summary>{activeLayer === "mangzhong" ? "展开芒种正文" : "正文"}</summary>
              <div className="summer-doc-editor">
                <textarea value={editingDoc} onChange={(e) => setEditingDoc(e.target.value)} rows={16} />
                <div className="summer-writer-actions">
                  <button onClick={() => setEditingDoc(layers[activeLayer] || "")}>还原</button>
                  <button className="summer-primary-btn" onClick={() => saveLayerDoc(activeLayer)} disabled={saving || !editingDoc.trim()}>
                    {saving ? "保存中" : "保存"}
                  </button>
                </div>
              </div>
            </details>
          ) : activeLayer === "xiazhi" ? (
            <SummerItemGroups
              layer="xiazhi"
              groups={[
                { key: "high", label: "权重 ≥ 6", items: highWeightXiazhi, empty: "还没有权重 ≥ 6 的夏至", initiallyOpen: true },
                { key: "low", label: "权重 < 6", items: lowWeightXiazhi, empty: "还没有权重 < 6 的夏至", initiallyOpen: false },
              ]}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={saveItem}
              onDelete={deleteItem}
              saving={saving}
            />
          ) : activeLayer === "rain" ? (
            <SummerItemGroups
              layer="rain"
              groups={[
                { key: "open", label: "未了结", items: openRain, empty: "没有未了结的 rain", initiallyOpen: true },
                { key: "closed", label: "已了结", items: closedRain, empty: "还没有已了结的 rain", initiallyOpen: false },
              ]}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={saveItem}
              onDelete={deleteItem}
              saving={saving}
            />
          ) : (
            <SummerEditableList
              layer={activeLayer}
              items={sectionItems[activeLayer] || []}
              empty={activeLayer === "sea" ? "sea 只进不改，还没有原文件" : "还没有内容"}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={saveItem}
              onDelete={deleteItem}
              saving={saving}
              readOnly={activeLayer === "sea"}
            />
          )}
        </section>
      ) : (
        <div className="summer-layer-list">
          {layerOrder.map((layer) => (
            <button className="summer-layer-card" key={layer} onClick={() => openLayer(layer)}>
              {retro && <SummerFolderIcon />}
              <div>
                <h3>{layerLabel(layer)}</h3>
                <p>{layerSub(layer)}</p>
              </div>
              <span>{counts[layer]}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (!retro) return <div className="summer-native">{content}</div>;

  function goToFolders() {
    setActiveLayer(null);
    setEditingItem(null);
  }

  return (
    <div className="xp-summer-browser">
      <nav className="xp-summer-navigation" aria-label="记忆目录">
        <label className="xp-summer-mobile-directory">
          <SummerFolderIcon />
          <span>目录</span>
          <select aria-label="选择记忆目录" value={activeLayer || ""} onChange={(event) => {
            if (event.target.value) openLayer(event.target.value);
            else goToFolders();
          }}>
            <option value="">全部文件夹</option>
            {layerOrder.map((layer) => <option key={layer} value={layer}>{SUMMER_FOLDERS[layer]} · {layerLabel(layer)}</option>)}
          </select>
        </label>
        <div className="xp-summer-tree">
          <h2>文件夹</h2>
          <button type="button" className="xp-summer-tree-root" aria-current={!activeLayer ? "page" : undefined} onClick={goToFolders}>
            <SummerFolderIcon /><b>summer</b>
          </button>
          {layerOrder.map((layer) => (
            <button type="button" key={layer} className="xp-summer-tree-folder" aria-current={activeLayer === layer ? "page" : undefined} onClick={() => openLayer(layer)}>
              <SummerFolderIcon />
              <span><b>{SUMMER_FOLDERS[layer]}</b><small>{loading ? "正在读取…" : counts[layer]}</small></span>
            </button>
          ))}
          <p className="xp-summer-tree-note">海不会跑掉，我也不会</p>
        </div>
      </nav>
      <div className="xp-summer-content" key={activeLayer || "folders"}>{content}</div>
    </div>
  );
}

export function SummerEditableList({
  layer,
  items,
  empty,
  editingItem,
  setEditingItem,
  onSave,
  onDelete,
  saving,
  readOnly = false,
}: {
  layer: string;
  items: SummerMemoryItem[];
  empty: string;
  editingItem: SummerMemoryItem | null;
  setEditingItem: React.Dispatch<React.SetStateAction<SummerMemoryItem | null>>;
  onSave: (layer: string, item: SummerMemoryItem) => void;
  onDelete: (layer: string, item: SummerMemoryItem) => void;
  saving: boolean;
  readOnly?: boolean;
}) {
  if (!items.length) {
    return <div className="summer-empty">{empty}</div>;
  }
  const showFileContent = layer === "sea" || layer === "sunny_file" || layer === "xiaoshu";
  return (
    <div className="summer-card-list">
      {items.map((item, index) => (
        <article className="summer-memory-card" key={item.id || `${item.date}-${index}`}>
          {editingItem?.id === item.id ? (
            <div className="summer-inline-editor">
              <input value={editingItem!.title || ""} onChange={(e) => setEditingItem({ ...editingItem!, title: e.target.value })} placeholder="标题" />
              {layer === "xiazhi" && (
                <label className="summer-writer-row">
                  <span>权重（1–10）</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editingItem!.weight ?? 5}
                    onChange={(e) => setEditingItem({
                      ...editingItem!,
                      weight: Math.max(1, Math.min(10, Number(e.target.value) || 5)),
                    })}
                  />
                </label>
              )}
              {layer === "rain" && (
                <div className="summer-writer-row">
                  <input value={editingItem!.due || ""} onChange={(e) => setEditingItem({ ...editingItem!, due: e.target.value })} placeholder="due，可空" />
                  <select value={editingItem!.status || "open"} onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value })}>
                    <option value="open">未了结</option>
                    <option value="closed">已了结</option>
                  </select>
                </div>
              )}
              <textarea value={editingItem!.content || ""} onChange={(e) => setEditingItem({ ...editingItem!, content: e.target.value })} rows={8} />
              <div className="summer-writer-actions">
                <button onClick={() => setEditingItem(null)}>取消</button>
                <button className="summer-primary-btn" onClick={() => onSave(layer, editingItem!)} disabled={saving || !editingItem!.content?.trim()}>
                  {saving ? "保存中" : "保存"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="summer-card-meta">
                <span>{item.date || item.due || item.filename || "summer"}</span>
                {item.weight && <span>权重 {item.weight}</span>}
                {layer === "rain" ? <span>{item.status === "closed" ? "已了结" : "未了结"}</span> : item.status && <span>{item.status}</span>}
              </div>
              {item.title && <h4>{item.title}</h4>}
              {showFileContent ? (
                <details className={`summer-card-content${layer === "xiaoshu" ? " summer-card-content-preview" : ""}`}>
                  <summary>
                    {layer === "xiaoshu" && <span className="summer-card-preview-text">{item.content || ""}</span>}
                    <span className="summer-card-toggle-text">
                      <span className="summer-card-toggle-open">{layer === "xiaoshu" ? "展开正文" : "展开内容"}</span>
                      <span className="summer-card-toggle-close">收起正文</span>
                    </span>
                  </summary>
                  <p>{item.content || ""}</p>
                </details>
              ) : (
                <p>{item.content || ""}</p>
              )}
              {!!item.tags?.length && (
                <div className="summer-tags">
                  {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              {!readOnly && (
                <div className="summer-card-actions">
                  {layer === "rain" && item.status !== "closed" && (
                    <button
                      disabled={saving}
                      onClick={() => {
                        if (confirm("确定把这条 rain 标记为已了结吗？")) {
                          onSave(layer, { ...item, status: "closed" });
                        }
                      }}
                    >
                      标记已了结
                    </button>
                  )}
                  <button onClick={() => setEditingItem({ ...item })}>修改</button>
                  <button onClick={() => onDelete(layer, item)}>删除</button>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export function SummerItemGroups({
  layer,
  groups,
  editingItem,
  setEditingItem,
  onSave,
  onDelete,
  saving,
}: {
  layer: string;
  groups: Array<{
    key: string;
    label: string;
    items: SummerMemoryItem[];
    empty: string;
    initiallyOpen: boolean;
  }>;
  editingItem: SummerMemoryItem | null;
  setEditingItem: React.Dispatch<React.SetStateAction<SummerMemoryItem | null>>;
  onSave: (layer: string, item: SummerMemoryItem) => void;
  onDelete: (layer: string, item: SummerMemoryItem) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="summer-memory-groups">
      {groups.map((group) => (
        <details
          className="summer-memory-group"
          key={group.key}
          open={expanded[group.key] ?? group.initiallyOpen}
          onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            setExpanded((current) => current[group.key] === isOpen ? current : { ...current, [group.key]: isOpen });
          }}
        >
          <summary>
            <span>{group.label}</span>
            <span>{group.items.length} 条</span>
          </summary>
          <div className="summer-memory-group-body">
            <SummerEditableList
              layer={layer}
              items={group.items}
              empty={group.empty}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onSave={onSave}
              onDelete={onDelete}
              saving={saving}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

export function SummerPageView({ assistantMode, assistantName, onBack, retro = false }: { assistantMode: AssistantMode; assistantName: string; onBack: () => void; retro?: boolean }) {
  if (retro) {
    return (
      <div className="xp-summer-screen">
        <section className="xp-summer-window" aria-label={`${assistantName}的 summer`}>
          <header className="xp-summer-titlebar">
            <SummerFolderIcon />
            <h1>{assistantName}的 summer</h1>
            <div className="xp-summer-controls">
              <i className="xp-summer-window-button xp-summer-min" aria-hidden="true" />
              <i className="xp-summer-window-button xp-summer-max" aria-hidden="true" />
              <button type="button" className="xp-summer-window-button xp-summer-close" aria-label="关闭窗口，回到桌面" onClick={onBack}>
                <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
              </button>
            </div>
          </header>
          <div className="xp-summer-address"><span>地址</span><SummerFolderIcon /><b>summer</b><span className="xp-summer-address-owner">{assistantName}的记忆档案</span></div>
          <SummerMemoryView assistantMode={assistantMode} retro />
          <footer className="xp-summer-statusbar"><span>sea &amp; rain</span><span>记得的，都在这里。</span></footer>
        </section>
      </div>
    );
  }

  return (
    <>
      <section className="diary-body" aria-label={`${assistantName}的 summer`}>
        <SummerMemoryView assistantMode={assistantMode} />
      </section>
      <PageBack onBack={onBack} />
    </>
  );
}
