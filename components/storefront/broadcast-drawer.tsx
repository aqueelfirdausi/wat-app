"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type Broadcast, subscribeToBroadcasts } from "@/lib/firebase/firestore";

const DISMISSED_KEY = "watapp-broadcasts-dismissed";

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function BroadcastDrawer() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    const unsub = subscribeToBroadcasts(setBroadcasts);
    return unsub;
  }, []);

  const unreadCount = mounted ? broadcasts.filter((b) => !dismissed.has(b.id)).length : 0;
  const hasUnread = unreadCount > 0;
  const dotColor = hasUnread ? "#e24242" : "#16c16b";
  const btnBg = hasUnread ? "#fff5f5" : "#f0faf5";
  const btnBorder = hasUnread ? "#e2424244" : "#16c16b44";
  const labelColor = hasUnread ? "#e24242" : "#16c16b";

  function markAllRead() {
    const next = new Set(dismissed);
    broadcasts.forEach((b) => next.add(b.id));
    setDismissed(next);
    writeDismissed(next);
  }

  function formatTime(sentAt: string) {
    try {
      const date = new Date(sentAt);
      const diffHours = (Date.now() - date.getTime()) / 3600000;
      const timeStr = date.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });
      if (diffHours < 24) return `Today · ${timeStr}`;
      if (diffHours < 48) return `Yesterday · ${timeStr}`;
      return date.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  }

  return (
    <>
      <style>{`
        @keyframes broadcast-pulse {
          0% { transform: scale(0.7); opacity: 0.7; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .broadcast-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.4); z-index: 100;
        }
        .broadcast-drawer {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 24px 24px 0 0;
          transform: translateY(100%);
          transition: transform 380ms cubic-bezier(0.32,0.72,0,1);
          z-index: 101; max-height: 80vh;
          display: flex; flex-direction: column;
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
        .broadcast-drawer.open { transform: translateY(0); }
        .broadcast-row {
          border-bottom: 1px solid #ebebeb;
          transition: background 150ms ease;
        }
        .broadcast-row:last-child { border-bottom: none; }
        .broadcast-row:hover { background: #f9f9f9 !important; }
        .broadcast-row:active { background: #f0f0f0 !important; }
      `}</style>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasUnread ? `${unreadCount} unread broadcast${unreadCount !== 1 ? "s" : ""}` : "All caught up"}
        style={{ display:"flex", alignItems:"center", gap:6, background:btnBg, border:`0.5px solid ${btnBorder}`, borderRadius:20, padding:"5px 10px 5px 8px", cursor:"pointer", position:"relative", flexShrink:0 }}
      >
        <span style={{ position:"relative", width:10, height:10, flexShrink:0 }}>
          <span style={{ position:"absolute", inset:-3, borderRadius:"50%", border:`1.5px solid ${dotColor}`, opacity:0, animation:"broadcast-pulse 2s ease-out infinite" }} />
          <span style={{ position:"absolute", inset:-3, borderRadius:"50%", border:`1.5px solid ${dotColor}`, opacity:0, animation:"broadcast-pulse 2s ease-out 0.7s infinite" }} />
          <span style={{ display:"block", width:10, height:10, borderRadius:"50%", background:dotColor, position:"relative", zIndex:1 }} />
        </span>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.05em", color:labelColor }}>LIVE</span>
        {hasUnread && (
          <span style={{ fontSize:9, fontWeight:700, width:16, height:16, borderRadius:"50%", background:"#e24242", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && <div className="broadcast-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className={`broadcast-drawer${open ? " open" : ""}`} role="dialog" aria-label="Broadcasts" aria-modal="true">
        <div style={{ width:40, height:4, background:"#ddd", borderRadius:2, margin:"12px auto 0", flexShrink:0 }} aria-hidden="true" />
        <div style={{ padding:"14px 20px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"0.5px solid #f0f0ec", flexShrink:0 }}>
          <strong style={{ fontSize:16, color:"#111" }}>Broadcasts</strong>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {hasUnread && (
              <button type="button" onClick={markAllRead} style={{ fontSize:12, color:"#007aff", fontWeight:500, background:"none", border:"none", cursor:"pointer" }}>
                Mark all read
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close broadcasts" style={{ fontSize:18, color:"#aaa", background:"none", border:"none", cursor:"pointer", lineHeight:1 }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {broadcasts.length === 0 ? (
            <p style={{ padding:"40px 20px", textAlign:"center", color:"#8e8e93", fontSize:13 }}>No broadcasts yet.</p>
          ) : (
            broadcasts.filter((b) => !dismissed.has(b.id)).map((b) => {
              const isUnread = mounted && !dismissed.has(b.id);
              const thumbBg = isUnread ? "#fff5f5" : "#f5f5f2";
              const thumbnail = (
                <div style={{ width:56, height:56, borderRadius:"50%", overflow:"hidden", background:thumbBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {b.productImageUrl
                    ? <Image src={b.productImageUrl} alt="" width={56} height={56} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} unoptimized />
                    : <span style={{ fontSize:22 }}>📦</span>}
                </div>
              );
              const textBlock = (
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:isUnread ? "#ff3b30" : "transparent", flexShrink:0 }} aria-hidden="true" />
                    <p style={{ fontSize:13, fontWeight:isUnread ? 600 : 500, color:isUnread ? "#111" : "#666", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</p>
                  </div>
                  {b.body && <p style={{ fontSize:12, color:isUnread ? "#777" : "#aaa", lineHeight:1.45, margin:"0 0 2px" }}>{b.body}</p>}
                  <p style={{ fontSize:10, color:isUnread ? "#ff3b30" : "#bbb", margin:0 }}>{formatTime(b.sentAt)}</p>
                </div>
              );
              const innerStyle = { flex:1, display:"flex", alignItems:"center", gap:12, minWidth:0, padding:"10px 16px 10px 0", textDecoration:"none" as const };
              return (
                <div key={b.id} className="broadcast-row" style={{ display:"flex", alignItems:"center", background:isUnread ? "#fffcfc" : "transparent" }}>
                  {/* dismiss — outside Link, far left */}
                  <button
                    type="button"
                    aria-label="Dismiss broadcast"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = new Set(dismissed);
                      next.add(b.id);
                      setDismissed(next);
                      writeDismissed(next);
                    }}
                    style={{ flexShrink:0, background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#c7c7cc", lineHeight:1, width:40, minHeight:44, display:"flex", alignItems:"center", justifyContent:"center" }}
                  >✕</button>
                  {/* content — Link if navigable, div otherwise */}
                  {b.productSlug ? (
                    <Link href={`/product/${b.productSlug}`} style={innerStyle}>
                      {textBlock}
                      {thumbnail}
                    </Link>
                  ) : (
                    <div style={innerStyle}>
                      {textBlock}
                      {thumbnail}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!hasUnread && broadcasts.length > 0 && (
            <p style={{ textAlign:"center", padding:"12px 20px", fontSize:11, color:"#8e8e93" }}>All caught up ✓</p>
          )}
        </div>
      </div>
    </>
  );
}
