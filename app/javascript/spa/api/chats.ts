import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { ChatIdSchema, MessageIdSchema, type ChatId, type MessageId } from "../ids";
import { readCsrfToken } from "./transactions";

export class ChatsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "ChatsApiError";
  }
}

export const ToolCallSchema = z.object({
  id: z.string(),
  function_name: z.string(),
  function_arguments: z.string(),
  function_result: z.optional(z.nullable(z.string())),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const MessageSchema = z.object({
  id: MessageIdSchema,
  type: z.string(),
  role: z.string(),
  content: z.string(),
  pending: z.boolean(),
  reasoning: z.boolean(),
  ai_model: z.optional(z.nullable(z.string())),
  created_at: z.string(),
  tool_calls: z.array(ToolCallSchema),
});
export type MessageItem = z.infer<typeof MessageSchema>;

export const ChatSummarySchema = z.object({
  id: ChatIdSchema,
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  messages_count: z.number(),
  error: z.nullable(z.string()),
});
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

export const ChatsIndexSchema = z.object({
  chats: z.array(ChatSummarySchema),
  ai_enabled: z.boolean(),
  ai_available: z.boolean(),
  default_model: z.string(),
  worker_healthy: z.boolean(),
  demo_warning: z.boolean(),
});
export type ChatsIndex = z.infer<typeof ChatsIndexSchema>;

export const ChatDetailSchema = z.object({
  id: ChatIdSchema,
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  debug_mode: z.boolean(),
  error: z.nullable(z.string()),
  technical_error: z.optional(z.nullable(z.string())),
  needs_response: z.boolean(),
  worker_healthy: z.boolean(),
  demo_warning: z.boolean(),
  messages: z.array(MessageSchema),
});
export type ChatDetail = z.infer<typeof ChatDetailSchema>;

export const NewChatPayloadSchema = z.object({
  chat: z.object({
    id: z.nullable(z.string()),
    title: z.string(),
  }),
  ai_enabled: z.boolean(),
  ai_available: z.boolean(),
  default_model: z.string(),
  worker_healthy: z.boolean(),
  demo_warning: z.boolean(),
});
export type NewChatPayload = z.infer<typeof NewChatPayloadSchema>;

export const CHATS_INDEX_PATH = "/chats.json";

export function chatsIndexQueryOptions(path = CHATS_INDEX_PATH) {
  return queryOptions({
    queryKey: ["spa", "chats"],
    queryFn: async (): Promise<ChatsIndex> => {
      const response = await fetch(path, { headers: { Accept: "application/json" } });
      if (response.ok) {
        const json: unknown = await response.json();
        return ChatsIndexSchema.parse(json);
      }
      throw new ChatsApiError("Failed to load chats", response.status);
    },
  });
}

export function chatDetailQueryOptions(chatId: ChatId) {
  return queryOptions({
    queryKey: ["spa", "chat", chatId],
    queryFn: async (): Promise<ChatDetail> => {
      const response = await fetch(`/chats/${encodeURIComponent(chatId)}.json`, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const json: unknown = await response.json();
        return ChatDetailSchema.parse(json);
      }
      throw new ChatsApiError("Failed to load chat", response.status);
    },
  });
}

export function newChatQueryOptions() {
  return queryOptions({
    queryKey: ["spa", "chats", "new"],
    queryFn: async (): Promise<NewChatPayload> => {
      const response = await fetch("/chats/new.json", {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const json: unknown = await response.json();
        return NewChatPayloadSchema.parse(json);
      }
      throw new ChatsApiError("Failed to load new chat", response.status);
    },
  });
}

export async function createChatRequest(input: {
  content: string;
  ai_model?: string;
}): Promise<ChatDetail> {
  const response = await fetch("/chats.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({ chat: input }),
  });
  if (response.ok) {
    const json: unknown = await response.json();
    return ChatDetailSchema.parse(json);
  }
  const errorJson: unknown = await response.json().catch(() => null);
  const errors = extractErrors(errorJson);
  throw new ChatsApiError("Failed to create chat", response.status, errors);
}

export async function createMessageRequest(
  chatId: ChatId,
  input: { content: string; ai_model?: string },
): Promise<MessageItem> {
  const response = await fetch(`/chats/${encodeURIComponent(chatId)}/messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({ message: input }),
  });
  if (response.ok) {
    const json: unknown = await response.json();
    return MessageSchema.parse(json);
  }
  const errorJson: unknown = await response.json().catch(() => null);
  const errors = extractErrors(errorJson);
  throw new ChatsApiError("Failed to send message", response.status, errors);
}

export async function updateChatTitleRequest(chatId: ChatId, title: string): Promise<ChatDetail> {
  const response = await fetch(`/chats/${encodeURIComponent(chatId)}.json`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({ chat: { title } }),
  });
  if (response.ok) {
    const json: unknown = await response.json();
    return ChatDetailSchema.parse(json);
  }
  const errorJson: unknown = await response.json().catch(() => null);
  const errors = extractErrors(errorJson);
  throw new ChatsApiError("Failed to update chat title", response.status, errors);
}

export async function deleteChatRequest(chatId: ChatId): Promise<void> {
  const response = await fetch(`/chats/${encodeURIComponent(chatId)}.json`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
  });
  if (response.ok) return;
  throw new ChatsApiError("Failed to delete chat", response.status);
}

export async function retryChatRequest(chatId: ChatId): Promise<ChatDetail> {
  const response = await fetch(`/chats/${encodeURIComponent(chatId)}/retry.json`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
  });
  if (response.ok) {
    const json: unknown = await response.json();
    return ChatDetailSchema.parse(json);
  }
  throw new ChatsApiError("Failed to retry message", response.status);
}

export async function reportMessageTimeoutRequest(
  chatId: ChatId,
  messageId: MessageId,
): Promise<boolean> {
  const response = await fetch(
    `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/report_timeout`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": readCsrfToken(),
      },
    },
  );
  return response.ok;
}

export async function enableAiRequest(userId: string): Promise<void> {
  const response = await fetch(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({ user: { ai_enabled: true } }),
  });
  if (response.ok) return;
  throw new ChatsApiError("Failed to enable AI", response.status);
}

function extractErrors(payload: unknown): string[] {
  if (typeof payload === "object" && payload !== null) {
    if ("errors" in payload && Array.isArray(payload.errors))
      return payload.errors.filter((item): item is string => typeof item === "string");
    if ("error" in payload && typeof payload.error === "string") return [payload.error];
  }
  return [];
}
