import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "16px",
      background: "var(--theme-canvas, #fdf6f0)", color: "var(--theme-text, #4a3f3a)", textAlign: "center", padding: "24px",
    }}>
      <img src="/icon-192.png" alt="" style={{ width: 72, height: 72, borderRadius: 18, opacity: 0.85 }} />
      <p style={{ fontSize: 18, fontWeight: 600 }}>这里没有路啦</p>
      <p style={{ fontSize: 14, color: "var(--theme-muted, #a09088)" }}>小猪迷路了，回家找我吧</p>
      <Link href="/" style={{
        marginTop: 8, padding: "10px 28px", borderRadius: 999,
        background: "var(--theme-accent, #c4866c)", color: "#fff", textDecoration: "none", fontSize: 14,
      }}>回家</Link>
    </main>
  );
}
