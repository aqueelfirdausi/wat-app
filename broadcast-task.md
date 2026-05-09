# Broadcast Drawer — Implementation Task

We are working on WAT App — a live stock broadcaster at watapp.pk.
Path: C:\Users\Administrator\Desktop\claude-Projects\WAT-app

**Rules:**
- DO NOT push to GitHub
- DO NOT deploy
- Local changes only
- Inspect every file before editing
- Smallest safe change only
- Run `npm run lint` and `npm run typecheck` when done

---

## What we are building

When the admin sends a push notification, it gets saved to Firestore and displayed on the storefront as a stacked broadcast history. A LIVE button in the header shows a red pulsing dot when there are unread broadcasts, and green when all are read. Tapping it opens a slide-up drawer showing all past broadcasts.

---

## CHANGE 1 — `app/api/notifications/send/route.ts`

Add this block right before the final `return NextResponse.json()` line:

```typescript
  // Save broadcast to Firestore for the storefront drawer
  await db.collection("broadcasts").add({
    title,
    body: notifBody,
    sentAt: new Date().toISOString(),
    sentBy: decodedToken.email ?? "",
  });
```

---

## CHANGE 2 — `lib/firebase/firestore.ts`

Add this at the very bottom of the file:

```typescript
export type Broadcast = {
  id: string;
  title: string;
  body: string;
  sentAt: string;
};

export function subscribeToBroadcasts(callback: (broadcasts: Broadcast[]) => void) {
  const firestore = ensureDb();
  return onSnapshot(
    query(collection(firestore, "broadcasts"), orderBy("sentAt", "desc"), limit(20)),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            title: String(data.title ?? ""),
            body: String(data.body ?? ""),
            sentAt: String(data.sentAt ?? ""),
          };
        })
      );
    }
  );
}
```

---

## CHANGE 3 — create new file `components/storefront/broadcast-drawer.tsx`

Create this file with exactly this content:

```typescript
"use client";

import { useEffect, useState } from "react";
import { type Broadcast, subscribeToBroadcasts } from "@/lib/firebase/firestore";

const LAST_READ_KEY = "watapp-broadcasts-last-read";

export function BroadcastDrawer() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [open, setOpen] = useState(false);
  const [lastRead, setLastRead] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLastRead(window.localStorage.getItem(LAST_READ_KEY) ?? "");
  }, []);

  useEffect(() => {
    const unsub = subscribeToBroadcasts(setBroadcasts);
    return unsub;
  }, []);

  const unreadCount = mounted ? broadcasts.filter((b) => b.sentAt > lastRead).length : 0;
  const hasUnread = unreadCount > 0;
  const dotColor = hasUnread ? "#e24242" : "#16c16b";
  const btnBg = hasUnread ? "#fff5f5" : "#f0faf5";
  const btnBorder = hasUnread ? "#e2424244" : "#16c16b44";
  const labelColor = hasUnread ? "#e24242" : "#16c16b";

  function markAllRead() {
    const now = new Date().toISOString();
    setLastRead(now);
    window.localStorage.setItem(LAST_READ_KEY, now);
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
          background: #fff; border-radius: 24px 24px 0 0;
          transform: translateY(100%);
          transition: transform 0.35s cubic-bezier(0.32,0.72,0,1);
          z-index: 101; max-height: 80vh;
          display: flex; flex-direction: column;
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
        .broadcast-drawer.open { transform: translateY(0); }
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
        <div style={{ width:36, height:4, background:"#ddd", borderRadius:2, margin:"12px auto 0", flexShrink:0 }} aria-hidden="true" />
        <div style={{ padding:"14px 20px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"0.5px solid #f0f0ec", flexShrink:0 }}>
          <strong style={{ fontSize:16, color:"#111" }}>Broadcasts</strong>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {hasUnread && (
              <button type="button" onClick={markAllRead} style={{ fontSize:12, color:"#16c16b", fontWeight:500, background:"none", border:"none", cursor:"pointer" }}>
                Mark all read
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close broadcasts" style={{ fontSize:18, color:"#aaa", background:"none", border:"none", cursor:"pointer", lineHeight:1 }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {broadcasts.length === 0 ? (
            <p style={{ padding:"40px 20px", textAlign:"center", color:"#aaa", fontSize:13 }}>No broadcasts yet.</p>
          ) : (
            broadcasts.map((b) => {
              const isUnread = mounted && b.sentAt > lastRead;
              return (
                <div key={b.id} style={{ padding:"12px 20px", display:"flex", gap:12, alignItems:"flex-start", borderBottom:"0.5px solid #f5f5f2", background:isUnread ? "#fffcfc" : "transparent" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:isUnread ? "#e24242" : "transparent", flexShrink:0, marginTop:5 }} aria-hidden="true" />
                  <div style={{ width:36, height:36, borderRadius:10, background:isUnread ? "#fff5f5" : "#f5f5f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📦</div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, fontWeight:isUnread ? 600 : 500, color:isUnread ? "#111" : "#666", marginBottom:2 }}>{b.title}</p>
                    {b.body && <p style={{ fontSize:12, color:isUnread ? "#777" : "#aaa", lineHeight:1.45 }}>{b.body}</p>}
                    <p style={{ fontSize:10, color:isUnread ? "#e24242" : "#bbb", marginTop:4 }}>{formatTime(b.sentAt)}</p>
                  </div>
                </div>
              );
            })
          )}
          {!hasUnread && broadcasts.length > 0 && (
            <p style={{ textAlign:"center", padding:"12px 20px", fontSize:11, color:"#bbb" }}>All caught up ✓</p>
          )}
        </div>
      </div>
    </>
  );
}
```

---

## CHANGE 4 — `components/homepage-client.tsx`

**Step A:** Add this import at the top with the other imports:

```typescript
import { BroadcastDrawer } from "@/components/storefront/broadcast-drawer";
```

**Step B:** In the header JSX, add `<BroadcastDrawer />` between the closing `</div>` of `platform-mark` and the `<a>` CTA link:

```tsx
<header className="platform-header">
  <div className="platform-mark">
    ...existing content, do not touch...
  </div>
  <BroadcastDrawer />
  <a href={`#${firstProductSectionId}`} className="primary-link">
    Open today&apos;s stock
  </a>
</header>
```

---

## When done

1. Run `npm run lint` — fix any errors
2. Run `npm run typecheck` — fix any errors
3. Do NOT commit
4. Report what was changed and confirm lint + typecheck passed
