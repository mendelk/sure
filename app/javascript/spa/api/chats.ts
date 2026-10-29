import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { ChatIdSchema, MessageIdSchema, type ChatId, type MessageId } from "../ids";
import { apiFetch } from "./client";

export class ChatsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(errors.length > 0 ? errors.join(", ") : message);
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

const WorkspaceMetadataSchema = z.object({
  ai_enabled: z.boolean(),
  ai_available: z.boolean(),
  default_model: z.string(),
  worker_healthy: z.boolean(),
  demo_warning: z.boolean(),
  response_timeout_ms: z.number(),
});

export const ChatsIndexSchema = z.object({
  ...WorkspaceMetadataSchema.shape,
  chats: z.array(ChatSummarySchema),
});
export type ChatsIndex = z.infer<typeof ChatsIndexSchema>;

export const ChatDetailSchema = z.object({
  id: ChatIdSchema,
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  debug_mode: z.boolean(),
  error: z.nullable(z.string()),
  technical_error: z.nullable(z.string()),
  needs_response: z.boolean(),
  worker_healthy: z.boolean(),
  demo_warning: z.boolean(),
  response_timeout_ms: z.number(),
  messages: z.array(MessageSchema),
});
export type ChatDetail = z.infer<typeof ChatDetailSchema>;

export const NewChatPayloadSchema = z.object({
  ...WorkspaceMetadataSchema.shape,
  chat: z.object({ id: z.nullable(z.string()), title: z.string() }),
});
export type NewChatPayload = z.infer<typeof NewChatPayloadSchema>;

const CanonicalMessageSchema = z.object({
  id: MessageIdSchema,
  type: z.string(),
  role: z.string(),
  content: z.string(),
  model: z.nullable(z.string()),
  pending: z.boolean(),
  reasoning: z.boolean(),
  created_at: z.string(),
  tool_calls: z.array(
    z.object({
      id: z.string(),
      function_name: z.string(),
      function_arguments: z.json(),
      function_result: z.json(),
    }),
  ),
});

const CanonicalSummarySchema = z.object({
  id: ChatIdSchema,
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  error: z.nullable(z.string()),
});

const IndexResponseSchema = z.object({
  workspace: z.object({
    ...WorkspaceMetadataSchema.shape,
    chats: z.array(CanonicalSummarySchema),
  }),
});

const DetailResponseSchema = z.object({
  id: ChatIdSchema,
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  error: z.nullable(z.string()),
  workspace: z.object({
    ...WorkspaceMetadataSchema.shape,
    debug_mode: z.boolean(),
    technical_error: z.nullable(z.string()),
    needs_response: z.boolean(),
    messages: z.array(CanonicalMessageSchema),
  }),
});

export const CHATS_INDEX_PATH = "/api/v1/chats?include=workspace";

export function chatsIndexQueryOptions() {
  return queryOptions({
    queryKey: ["spa", "chats"],
    queryFn: async (): Promise<ChatsIndex> => {
      const response = await chatRequest(CHATS_INDEX_PATH, {}, "Failed to load chats");
      const { workspace } = IndexResponseSchema.parse(await response.json());
      return {
        ...workspace,
        chats: workspace.chats.map((chat) => ({
          id: chat.id,
          title: chat.title,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          error: chat.error,
          messages_count: chat.message_count,
        })),
      };
    },
  });
}

export function chatDetailQueryOptions(chatId: ChatId) {
  return queryOptions({
    queryKey: ["spa", "chat", chatId],
    queryFn: async (): Promise<ChatDetail> => {
      const response = await chatRequest(
        `/api/v1/chats/${encodeURIComponent(chatId)}?include=workspace`,
        {},
        "Failed to load chat",
      );
      return parseChatDetail(await response.json());
    },
  });
}

export function newChatQueryOptions() {
  return queryOptions({
    queryKey: ["spa", "chats", "new"],
    queryFn: async (): Promise<NewChatPayload> => {
      const response = await chatRequest(
        "/api/v1/chats/form_options",
        {},
        "Failed to load new chat",
      );
      return NewChatPayloadSchema.parse(await response.json());
    },
  });
}
export async function createChatRequest(input: {
  message: string;
  model?: string;
}): Promise<ChatDetail> {
  const response = await chatRequest(
    CHATS_INDEX_PATH,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    "Failed to create chat",
  );
  return parseChatDetail(await response.json());
}

export async function createMessageRequest(
  chatId: ChatId,
  input: { content: string; model?: string },
): Promise<MessageItem> {
  const response = await chatRequest(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    "Failed to send message",
  );
  return parseMessage(CanonicalMessageSchema.parse(await response.json()));
}

export async function updateChatTitleRequest(chatId: ChatId, title: string): Promise<ChatDetail> {
  const response = await chatRequest(
    `/api/v1/chats/${encodeURIComponent(chatId)}?include=workspace`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
    "Failed to update chat title",
  );
  return parseChatDetail(await response.json());
}

export async function deleteChatRequest(chatId: ChatId): Promise<void> {
  await chatRequest(
    `/api/v1/chats/${encodeURIComponent(chatId)}`,
    {
      method: "DELETE",
    },
    "Failed to delete chat",
  );
}

export async function markChatViewedRequest(chatId: ChatId): Promise<void> {
  await chatRequest(
    `/api/v1/chats/${encodeURIComponent(chatId)}/view`,
    {
      method: "PATCH",
    },
    "Failed to record viewed chat",
  );
}

export async function retryChatRequest(chatId: ChatId): Promise<void> {
  await chatRequest(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages/retry`,
    {
      method: "POST",
    },
    "Failed to retry message",
  );
}

export async function reportMessageTimeoutRequest(
  chatId: ChatId,
  messageId: MessageId,
): Promise<boolean> {
  const response = await apiFetch(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/report_timeout`,
    { method: "POST" },
  );
  return response.ok;
}

export async function enableAiRequest(): Promise<void> {
  await chatRequest("/api/v1/auth/enable_ai", { method: "PATCH" }, "Failed to enable AI");
}

function parseChatDetail(payload: unknown): ChatDetail {
  const { workspace, ...chat } = DetailResponseSchema.parse(payload);
  return { ...chat, ...workspace, messages: workspace.messages.map(parseMessage) };
}

function parseMessage(message: z.infer<typeof CanonicalMessageSchema>): MessageItem {
  return {
    ...message,
    ai_model: message.model,
    tool_calls: message.tool_calls.map((toolCall) => {
      const args = toolCall.function_arguments;
      const result = toolCall.function_result;
      return {
        ...toolCall,
        function_arguments: typeof args === "string" ? args : JSON.stringify(args),
        function_result:
          result === null ? null : typeof result === "string" ? result : JSON.stringify(result),
      };
    }),
  };
}

async function chatRequest(path: string, init: RequestInit, message: string): Promise<Response> {
  const response = await apiFetch(path, init);
  if (response.ok) return response;
  const payload: unknown = await response.json().catch(() => null);
  throw new ChatsApiError(message, response.status, extractErrors(payload));
}

function extractErrors(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  if ("errors" in payload && Array.isArray(payload.errors))
    return payload.errors.filter((item): item is string => typeof item === "string");
  if ("details" in payload && Array.isArray(payload.details))
    return payload.details.filter((item): item is string => typeof item === "string");
  if ("message" in payload && typeof payload.message === "string") return [payload.message];
  if ("error" in payload && typeof payload.error === "string") return [payload.error];
  return [];
}
