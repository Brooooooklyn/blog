import { useEffect, useRef, useState } from "react"
import { connect } from "void/ws"

interface Cursor {
  id: string
  color: string
  name?: string
  avatar?: string
  x: number
  y: number
  lastSeen: number
}

export default function CursorPresence({ postname }: { postname: string }) {
  const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map())
  const rafRef = useRef<number>(0)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const socket = connect(`/cursors/${postname}`)

    socket.on("message", (event: any) => {
      if (event.type === "cursor") {
        setCursors((prev) => {
          const next = new Map(prev)
          next.set(event.id, {
            id: event.id,
            color: event.color,
            name: event.name,
            avatar: event.avatar,
            x: event.x,
            y: event.y,
            lastSeen: Date.now(),
          })
          return next
        })
      } else if (event.type === "leave") {
        setCursors((prev) => {
          const next = new Map(prev)
          next.delete(event.id)
          return next
        })
      }
    })

    function onMouseMove(e: MouseEvent) {
      const x = e.clientX / window.innerWidth
      const y = (e.clientY + window.scrollY) / document.documentElement.scrollHeight
      pendingRef.current = { x, y }

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingRef.current) {
            socket.send({ type: "cursor", ...pendingRef.current })
            pendingRef.current = null
          }
          rafRef.current = 0
        })
      }
    }

    window.addEventListener("mousemove", onMouseMove)

    const cleanup = setInterval(() => {
      const now = Date.now()
      setCursors((prev) => {
        const next = new Map(prev)
        for (const [id, cursor] of next) {
          if (now - cursor.lastSeen > 10_000) next.delete(id)
        }
        return next.size !== prev.size ? next : prev
      })
    }, 5_000)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      cancelAnimationFrame(rafRef.current)
      clearInterval(cleanup)
      socket.close()
    }
  }, [postname])

  return (
    <>
      {Array.from(cursors.values()).map((cursor) => (
        <div
          key={cursor.id}
          style={{
            position: "absolute",
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * document.documentElement.scrollHeight}px`,
            pointerEvents: "none",
            zIndex: 9999,
            transition: "left 0.15s ease-out, top 0.15s ease-out",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
          >
            <path
              d="M3 3L10 17L12.5 10.5L19 8L3 3Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              marginLeft: "16px",
              marginTop: "-4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: cursor.color,
              color: "white",
              fontSize: "11px",
              fontWeight: 500,
              padding: cursor.avatar ? "2px 6px 2px 2px" : "2px 6px",
              borderRadius: "10px",
              whiteSpace: "nowrap",
              opacity: 0.9,
            }}
          >
            {cursor.avatar && (
              <img
                src={cursor.avatar}
                alt=""
                style={{ width: 16, height: 16, borderRadius: "50%" }}
              />
            )}
            {cursor.name || "Reader"}
          </div>
        </div>
      ))}
    </>
  )
}
