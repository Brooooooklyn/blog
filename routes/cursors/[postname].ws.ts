import { defineRoom } from "void/ws"
import * as v from "valibot"

const clientMessage = v.object({
  type: v.literal("cursor"),
  x: v.number(),
  y: v.number(),
})

const serverMessage = v.object({
  type: v.picklist(["cursor", "leave"]),
  id: v.string(),
  color: v.string(),
  name: v.optional(v.string()),
  avatar: v.optional(v.string()),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
})

const COLORS = [
  "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#34d399",
  "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#e879f9",
]

function pickColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default defineRoom({
  messages: { client: clientMessage, server: serverMessage },

  onConnect(ctx) {
    const color = pickColor(ctx.connection.id)
    const name = ctx.user?.name ?? undefined
    const avatar = ctx.user?.image ?? undefined
    ctx.connection.setState({ color, name, avatar })
  },

  async onMessage(ctx, event) {
    if (event.type === "cursor") {
      const { color, name, avatar } = ctx.connection.state as { color: string; name?: string; avatar?: string }
      await ctx.room.broadcast(
        { type: "cursor", id: ctx.connection.id, color, name, avatar, x: event.x, y: event.y },
        [ctx.connection.id],
      )
    }
  },

  async onClose(ctx) {
    await ctx.room.broadcast(
      { type: "leave", id: ctx.connection.id, color: "" },
      [ctx.connection.id],
    )
  },
})
