"use client";

import { useEffect, useState } from "react";

type NotificationButtonProps = {
  onSubscribe: (subscription: PushSubscriptionJSON) => Promise<void>;
};

export function NotificationButton({ onSubscribe }: NotificationButtonProps) {
  const [status, setStatus] = useState<"unknown" | "granted" | "denied" | "subscribing" | "done">("unknown");

  useEffect(() => {
    if (!("Notification" in window)) return;
    const frame = window.requestAnimationFrame(() => {
      setStatus(Notification.permission === "granted" ? "granted" : "unknown");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("denied");
      return;
    }
    setStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: "BEO_NKi2flx9e44dSBumFf_jaJwhPm5slyseo60sVeQ0cKlR95IA4fSprghlWeVdWNvdqmYSXiVtSx-Pqyhj7vU",
      });

      await onSubscribe(sub.toJSON());
      setStatus("done");
    } catch {
      setStatus("denied");
    }
  }

  if (status === "done" || status === "granted") {
    return <div className="settings-hint" style={{ color: "#7c9a92" }}>已开启通知</div>;
  }
  if (status === "denied") {
    return <div className="settings-hint" style={{ color: "#c4866c" }}>无法开启，请在系统设置中允许通知</div>;
  }
  if (status === "subscribing") {
    return <div className="settings-hint">正在开启...</div>;
  }
  return (
    <button className="settings-danger-btn" style={{ borderColor: "#7c9a92", color: "#7c9a92" }} onClick={enableNotifications}>
      开启通知
    </button>
  );
}
