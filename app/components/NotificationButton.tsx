"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 服务器取不到公钥时的兜底（与最初生成的 VAPID 公钥一致）。
const FALLBACK_PUBLIC_KEY = "BEO_NKi2flx9e44dSBumFf_jaJwhPm5slyseo60sVeQ0cKlR95IA4fSprghlWeVdWNvdqmYSXiVtSx-Pqyhj7vU";

type NotificationButtonProps = {
  onSubscribe: (subscription: PushSubscriptionJSON) => Promise<void>;
  loadPublicKey: () => Promise<string | null>;
  onTest: () => Promise<string>;
};

type Status = "unknown" | "syncing" | "done" | "denied" | "unsupported" | "failed";

function toBase64Url(buffer: ArrayBuffer | null | undefined) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function supportsPush() {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function NotificationButton({ onSubscribe, loadPublicKey, onTest }: NotificationButtonProps) {
  const [status, setStatus] = useState<Status>("unknown");
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);
  // 父组件每次渲染都会传新的回调，用 ref 保持同步逻辑稳定，避免反复重新订阅。
  const propsRef = useRef({ onSubscribe, loadPublicKey });
  useEffect(() => {
    propsRef.current = { onSubscribe, loadPublicKey };
  }, [onSubscribe, loadPublicKey]);

  // 确保浏览器里有一个用当前服务器公钥创建的订阅，并把它同步给服务器。
  // iOS 会在重装主屏幕应用、清数据或长时间不用后作废订阅；只看系统权限会误以为"已开启"。
  const syncSubscription = useCallback(async () => {
    const { onSubscribe: save, loadPublicKey: loadKey } = propsRef.current;
    const serverKey = (await loadKey().catch(() => null)) || FALLBACK_PUBLIC_KEY;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && toBase64Url(sub.options.applicationServerKey) !== serverKey) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
    }
    await save(sub.toJSON());
  }, []);

  useEffect(() => {
    if (!supportsPush()) {
      const frame = window.requestAnimationFrame(() => setStatus("unsupported"));
      return () => window.cancelAnimationFrame(frame);
    }
    if (Notification.permission === "denied") {
      const frame = window.requestAnimationFrame(() => setStatus("denied"));
      return () => window.cancelAnimationFrame(frame);
    }
    if (Notification.permission !== "granted") return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      setStatus("syncing");
      syncSubscription()
        .then(() => { if (!cancelled) setStatus("done"); })
        .catch(() => { if (!cancelled) setStatus("failed"); });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [syncSubscription]);

  async function enableNotifications() {
    if (!supportsPush()) {
      setStatus("unsupported");
      return;
    }
    setStatus("syncing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      await syncSubscription();
      setStatus("done");
    } catch {
      setStatus("failed");
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult("");
    try {
      setTestResult(await onTest());
    } catch {
      setTestResult("测试请求失败");
    } finally {
      setTesting(false);
    }
  }

  if (status === "done") {
    return (
      <>
        <div className="settings-hint" style={{ color: "var(--theme-success, #7c9a92)" }}>已开启通知</div>
        <button className="settings-danger-btn" style={{ borderColor: "var(--theme-success, #7c9a92)", color: "var(--theme-success, #7c9a92)" }} onClick={sendTest} disabled={testing}>
          {testing ? "发送中..." : "发一条测试通知"}
        </button>
        {testResult && <div className="settings-hint">{testResult}</div>}
      </>
    );
  }
  if (status === "denied") {
    return <div className="settings-hint" style={{ color: "var(--theme-accent, #c4866c)" }}>通知权限被拒绝，请在系统设置中允许通知</div>;
  }
  if (status === "unsupported") {
    return <div className="settings-hint" style={{ color: "var(--theme-accent, #c4866c)" }}>当前环境不支持推送（iPhone 需要从主屏幕图标打开）</div>;
  }
  if (status === "syncing") {
    return <div className="settings-hint">正在检查通知订阅...</div>;
  }
  return (
    <>
      {status === "failed" && (
        <div className="settings-hint" style={{ color: "var(--theme-accent, #c4866c)" }}>通知订阅同步失败，点下面重新开启</div>
      )}
      <button className="settings-danger-btn" style={{ borderColor: "var(--theme-success, #7c9a92)", color: "var(--theme-success, #7c9a92)" }} onClick={enableNotifications}>
        {status === "failed" ? "重新开启通知" : "开启通知"}
      </button>
    </>
  );
}
