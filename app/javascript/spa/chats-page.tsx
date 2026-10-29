/* eslint-disable import/max-dependencies -- Chats page composes chat list, chat nav, message feed, and chat input. */
import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chatDetailQueryOptions,
  chatsIndexQueryOptions,
  createChatRequest,
  createMessageRequest,
  deleteChatRequest,
  enableAiRequest,
  markChatViewedRequest,
  newChatQueryOptions,
  reportMessageTimeoutRequest,
  retryChatRequest,
  updateChatTitleRequest,
  type ChatDetail,
  type ChatSummary,
} from "./api/chats";
import { Alert } from "./components/alert";
import { Button, MenuItem } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import type { ChatId } from "./ids";
import { Modal } from "./modal";

const CHATS_TEXT = {
  title: "Chats",
  newChat: "New chat",
  allChats: "All chats",
  defaultTitle: "New chat",
  placeholder: "Ask anything about your finances...",
  disclaimer: "AI can make mistakes. Verify important financial info.",
  comingSoon: "Coming soon",
  thinking: "Thinking…",
  retry: "Retry",
  deleteChat: "Delete chat",
  editTitle: "Edit title",
  cancel: "Cancel",
  save: "Save",
  deleteTitle: "Delete chat?",
  deleteConfirm:
    "Are you sure you want to delete this chat? This conversation history cannot be recovered.",
  assistantReasoning: "Assistant reasoning",
  toolCalls: "Tool calls",
  functionLabel: "Function",
  argumentsLabel: "Arguments",
  greetingHeading: "How can I help you today?",
  commandsHint: "Ask about your spending, investments, net worth, or create rules and tags.",
  questionsIntro: "Here are a few things you can ask:",
  q1: "Evaluate portfolio",
  q2: "Spending insights",
  q3: "Unusual patterns",
  enableAiTitle: "Enable AI Chats",
  enableAiDesc:
    "Ask questions about your finances, analyze spending trends, and get personalized insights.",
  enableAiButton: "Enable AI Chats",
  enableAiNote: "You can disable this at any time in your profile settings.",
  aiUnavailable:
    "AI is not available for your account. Configure an AI provider before enabling chats.",
  workerUnhealthy:
    "The background worker that delivers AI responses appears to be down or backed up. Responses may take longer than usual.",
  demoWarningTitle: "Demo Workspace",
  demoWarningMessage:
    "AI features are running in demo mode with sample data. Live providers are not connected.",
} as const;

function formatRelativeTime(dateString: string): string {
  const diffMinutes = Math.floor((Date.now() - Date.parse(dateString)) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export function AiAvatar() {
  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-container-inset text-primary antialiased"
      style={{ filter: "drop-shadow(0px 4px 6px rgba(244, 78, 247, 0.15))" }}
    >
      <Icon className="size-4 text-primary" name="sparkles" />
    </div>
  );
}

function AiConsentCard({ available, onEnabled }: { available: boolean; onEnabled: () => void }) {
  const mutation = useMutation({
    mutationFn: enableAiRequest,
    onSuccess: onEnabled,
  });

  return (
    <div className="mx-auto max-w-md rounded-xl bg-container p-6 shadow-border-xs text-center">
      <div className="mb-4 flex justify-center">
        <AiAvatar />
      </div>
      <h3 className="mb-2 text-base font-medium text-primary">{CHATS_TEXT.enableAiTitle}</h3>
      <p className="mb-6 text-sm text-secondary">{CHATS_TEXT.enableAiDesc}</p>
      {!available ? <Alert variant="warning">{CHATS_TEXT.aiUnavailable}</Alert> : null}
      {mutation.isError ? <Alert variant="error">{mutation.error.message}</Alert> : null}
      <Button
        disabled={mutation.isPending || !available}
        fullWidth
        onClick={() => {
          mutation.mutate();
        }}
      >
        {CHATS_TEXT.enableAiButton}
      </Button>
      <p className="mt-3 text-xs text-secondary">{CHATS_TEXT.enableAiNote}</p>
    </div>
  );
}

function AiGreeting({ onSelectQuestion }: { onSelectQuestion: (question: string) => void }) {
  const sampleQuestions = [
    { icon: "chart-area" as const, text: CHATS_TEXT.q1 },
    { icon: "wallet-minimal" as const, text: CHATS_TEXT.q2 },
    { icon: "alert-triangle" as const, text: CHATS_TEXT.q3 },
  ];

  return (
    <div className="flex w-full items-start gap-4 p-4">
      <AiAvatar />
      <div className="max-w-[85%] space-y-4 text-sm text-primary">
        <h2 className="text-base font-medium">{CHATS_TEXT.greetingHeading}</h2>
        <p className="text-secondary">{CHATS_TEXT.commandsHint}</p>
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-secondary">
            {CHATS_TEXT.questionsIntro}
          </p>
          <div className="flex flex-wrap gap-2">
            {sampleQuestions.map((q) => (
              <button
                className="flex items-center gap-2 rounded-full border border-tertiary px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-inset"
                key={q.text}
                onClick={() => {
                  onSelectQuestion(q.text);
                }}
                type="button"
              >
                <Icon className="size-3.5 text-secondary" name={q.icon} />
                <span>{q.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatInputBar({
  disabled,
  initialContent = "",
  onSubmit,
}: {
  disabled?: boolean;
  initialContent?: string;
  onSubmit: (content: string) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const trimmed = content.trim();
      if (trimmed.length > 0 && disabled !== true) {
        onSubmit(trimmed);
        setContent("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length > 0 && disabled !== true) {
      onSubmit(trimmed);
      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  return (
    <div className="w-full space-y-2">
      <form
        className="flex gap-2 rounded-xl bg-container p-2 shadow-border-xs lg:flex-col"
        onSubmit={handleSubmit}
      >
        <textarea
          className="w-full resize-none border-0 bg-transparent px-2 text-sm text-primary placeholder:text-secondary focus:ring-0"
          disabled={disabled === true}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={CHATS_TEXT.placeholder}
          ref={textareaRef}
          rows={1}
          value={content}
        />
        <div className="flex items-center justify-between gap-1">
          <div className="hidden items-center gap-1 lg:flex">
            {(["plus", "command", "at-sign", "mouse-pointer-click"] as const).map((icon) => (
              <span
                className="inline-flex size-7 items-center justify-center text-secondary opacity-40 cursor-not-allowed"
                key={icon}
                title={CHATS_TEXT.comingSoon}
              >
                <Icon name={icon} size="sm" />
              </span>
            ))}
          </div>
          <button
            aria-label="Send message"
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg bg-inverse text-inverse transition-colors hover:bg-inverse-hover disabled:opacity-40"
            disabled={disabled === true || content.trim().length === 0}
            type="submit"
          >
            <Icon name="arrow-up" size="sm" />
          </button>
        </div>
      </form>
      <p className="text-center text-xs text-secondary">{CHATS_TEXT.disclaimer}</p>
    </div>
  );
}

export function ChatTitleEditDialog({
  chat,
  onClose,
  onSaved,
}: {
  chat: { id: ChatId; title: string };
  onClose: () => void;
  onSaved: (chat: ChatDetail) => void;
}) {
  const [title, setTitle] = useState(chat.title);
  const mutation = useMutation({
    mutationFn: () => updateChatTitleRequest(chat.id, title.trim()),
    onSuccess: (updated) => {
      onSaved(updated);
    },
  });

  return (
    <Modal
      ariaLabelledby="edit-chat-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <DialogTitle className="text-lg font-medium text-primary" id="edit-chat-title">
        {CHATS_TEXT.editTitle}
      </DialogTitle>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length > 0) mutation.mutate();
        }}
      >
        <FormField
          id="chat-title-input"
          label="Title"
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          value={title}
        />
        {mutation.isError ? <Alert variant="error">{mutation.error.message}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            {CHATS_TEXT.cancel}
          </Button>
          <Button disabled={mutation.isPending || title.trim().length === 0} type="submit">
            {CHATS_TEXT.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ChatsIndexPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(chatsIndexQueryOptions());
  const [deleteTarget, setDeleteTarget] = useState<ChatSummary | null>(null);
  const [editTarget, setEditTarget] = useState<ChatSummary | null>(null);
  const [promptSeed, setPromptSeed] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (chatId: ChatId) => deleteChatRequest(chatId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
      setDeleteTarget(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => createChatRequest({ message: content }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
      void navigate({ to: "/chats/$chatId", params: { chatId: detail.id } });
    },
  });

  if (query.data && !query.data.ai_enabled) {
    return (
      <section className="p-4">
        <AiConsentCard
          available={query.data.ai_available}
          onEnabled={() => {
            void query.refetch();
          }}
        />
      </section>
    );
  }

  const data = query.data;
  const chats = data?.chats ?? [];

  return (
    <section className="flex h-full flex-col space-y-4">
      {query.isError ? <Alert variant="error">{query.error.message}</Alert> : null}
      {createMutation.isError ? (
        <Alert variant="error">{createMutation.error.message}</Alert>
      ) : null}
      {deleteMutation.isError ? (
        <Alert variant="error">{deleteMutation.error.message}</Alert>
      ) : null}
      {data?.demo_warning === true ? (
        <Alert variant="warning">
          <strong>{CHATS_TEXT.demoWarningTitle}</strong> — {CHATS_TEXT.demoWarningMessage}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-primary">{CHATS_TEXT.title}</h1>
        <Link
          className="focus-ring inline-flex size-9 items-center justify-center rounded-lg bg-container text-primary shadow-border-xs transition-colors hover:bg-container-hover"
          to="/chats/new"
        >
          <Icon name="plus" size="sm" />
        </Link>
      </div>

      {chats.length > 0 ? (
        <ul className="space-y-2">
          {chats.map((chat) => (
            <li
              className="flex items-center justify-between rounded-xl bg-container p-4 shadow-border-xs transition-colors hover:bg-surface-hover"
              key={chat.id}
            >
              <Link
                className="min-w-0 flex-1 pr-4"
                params={{ chatId: chat.id }}
                to="/chats/$chatId"
              >
                <p className="truncate text-sm font-medium text-primary">{chat.title}</p>
                <p className="mt-1 text-xs text-secondary">{formatRelativeTime(chat.updated_at)}</p>
              </Link>
              <div className="flex items-center gap-1">
                <IconButton
                  icon="pencil"
                  label={CHATS_TEXT.editTitle}
                  onClick={() => {
                    setEditTarget(chat);
                  }}
                />
                <IconButton
                  icon="trash-2"
                  label={CHATS_TEXT.deleteChat}
                  onClick={() => {
                    setDeleteTarget(chat);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col justify-between py-8">
          <AiGreeting
            onSelectQuestion={(q) => {
              setPromptSeed(q);
            }}
          />
          <div className="mt-auto px-2">
            <ChatInputBar
              disabled={createMutation.isPending || data?.ai_enabled !== true}
              initialContent={promptSeed}
              key={promptSeed}
              onSubmit={(content) => {
                createMutation.mutate(content);
              }}
            />
          </div>
        </div>
      )}

      {editTarget ? (
        <ChatTitleEditDialog
          chat={editTarget}
          onClose={() => {
            setEditTarget(null);
          }}
          onSaved={() => {
            setEditTarget(null);
            void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
          }}
        />
      ) : null}

      {deleteTarget ? (
        <Modal
          ariaLabelledby="delete-chat-dialog"
          onClose={() => {
            setDeleteTarget(null);
          }}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <DialogTitle className="text-lg font-medium text-primary" id="delete-chat-dialog">
            {CHATS_TEXT.deleteTitle}
          </DialogTitle>
          <p className="mt-2 text-sm text-secondary">{CHATS_TEXT.deleteConfirm}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              onClick={() => {
                setDeleteTarget(null);
              }}
              variant="secondary"
            >
              {CHATS_TEXT.cancel}
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate(deleteTarget.id);
              }}
              variant="destructive"
            >
              {CHATS_TEXT.deleteChat}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export function ChatDetailPage({ chatId }: { chatId: ChatId }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewedChatRef = useRef<ChatId | null>(null);

  const query = useQuery({
    ...chatDetailQueryOptions(chatId),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const hasPending = data.needs_response || data.messages.some((m) => m.pending);
      return hasPending ? 1500 : false;
    },
  });

  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const viewMutation = useMutation({ mutationFn: markChatViewedRequest });
  const markViewed = viewMutation.mutate;

  useEffect(() => {
    if (query.data?.id !== chatId || viewedChatRef.current === chatId) return;
    viewedChatRef.current = chatId;
    markViewed(chatId);
  }, [chatId, query.data?.id, markViewed]);

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => createMessageRequest(chatId, { content }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spa", "chat", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryChatRequest(chatId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spa", "chat", chatId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteChatRequest(chatId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
      void navigate({ to: "/chats" });
    },
  });

  const chat = query.data;
  const messages = chat?.messages ?? [];
  const messagesCount = messages.length;

  // Auto-scroll when messages update
  useEffect(() => {
    if (messagesCount > 0) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesCount]);

  // Polling keeps the watchdog active after an early report is declined.
  useEffect(() => {
    if (!chat) return;
    const pendingMsg = chat.messages.find((m) => m.pending);
    if (!pendingMsg) return;
    const ageMs = Date.now() - Date.parse(pendingMsg.created_at);
    if (ageMs > chat.response_timeout_ms) {
      void reportMessageTimeoutRequest(chatId, pendingMsg.id).then((ok) => {
        if (ok) void query.refetch();
      });
    }
  }, [chatId, chat, query]);

  return (
    <section className="flex h-full flex-col">
      {query.isError ? <Alert variant="error">{query.error.message}</Alert> : null}
      {sendMessageMutation.isError ? (
        <Alert variant="error">{sendMessageMutation.error.message}</Alert>
      ) : null}
      {retryMutation.isError ? <Alert variant="error">{retryMutation.error.message}</Alert> : null}
      {deleteMutation.isError ? (
        <Alert variant="error">{deleteMutation.error.message}</Alert>
      ) : null}
      {viewMutation.isError ? <Alert variant="error">{viewMutation.error.message}</Alert> : null}
      {/* Top navigation */}
      <div className="flex items-center justify-between border-b border-tertiary pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-inset hover:text-primary"
            title={CHATS_TEXT.allChats}
            to="/chats"
          >
            <Icon name="arrow-left" size="sm" />
          </Link>
          <button
            className="truncate text-left text-base font-medium text-primary hover:underline cursor-pointer"
            onClick={() => {
              setEditTitleOpen(true);
            }}
            type="button"
          >
            {chat?.title ?? CHATS_TEXT.defaultTitle}
          </button>
        </div>

        <div className="relative flex items-center gap-1">
          <Link
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-inset hover:text-primary"
            title={CHATS_TEXT.newChat}
            to="/chats/new"
          >
            <Icon name="plus" size="sm" />
          </Link>
          <IconButton
            icon="more-horizontal"
            label="Chat options"
            onClick={() => {
              setMenuOpen((prev) => !prev);
            }}
          />
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg bg-container py-1 shadow-border-lg"
              role="menu"
            >
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setEditTitleOpen(true);
                }}
              >
                {CHATS_TEXT.editTitle}
              </MenuItem>
              <MenuItem
                destructive
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteConfirmOpen(true);
                }}
              >
                {CHATS_TEXT.deleteChat}
              </MenuItem>
            </div>
          ) : null}
        </div>
      </div>

      {chat?.worker_healthy === false ? (
        <div className="mt-2">
          <Alert variant="warning">{CHATS_TEXT.workerUnhealthy}</Alert>
        </div>
      ) : null}

      {/* Messages feed */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              className={
                isUser ? "ml-auto max-w-[85%] w-fit" : "flex items-start gap-3 max-w-[85%]"
              }
              key={message.id}
            >
              {!isUser ? <AiAvatar /> : null}
              <div
                className={
                  isUser
                    ? "rounded-2xl bg-surface-inset px-4 py-2.5 text-sm text-primary"
                    : "space-y-2 text-sm text-primary"
                }
              >
                {message.pending ? (
                  <p className="animate-pulse text-sm text-secondary">{CHATS_TEXT.thinking}</p>
                ) : message.reasoning ? (
                  <details className="group rounded-lg bg-surface-inset p-2">
                    <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-secondary">
                      <span>{CHATS_TEXT.assistantReasoning}</span>
                      <Icon
                        className="size-3 group-open:rotate-180 transition-transform"
                        name="chevron-down"
                      />
                    </summary>
                    <div className="prose max-w-none wrap-break-word text-sm text-primary mt-2">
                      <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                    </div>
                  </details>
                ) : (
                  <>
                    {message.tool_calls.length > 0 ? (
                      <details className="group mb-2 rounded-lg bg-surface-inset p-2">
                        <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-secondary">
                          <Icon
                            className="size-3 group-open:rotate-90 transition-transform"
                            name="chevron-right"
                          />
                          <span>{CHATS_TEXT.toolCalls}</span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {message.tool_calls.map((tc) => (
                            <div
                              className="rounded-md border border-tertiary p-2 text-xs font-mono"
                              key={tc.id}
                            >
                              <p className="font-semibold text-secondary">
                                {CHATS_TEXT.functionLabel}: {tc.function_name}
                              </p>
                              <pre className="mt-1 whitespace-pre-wrap text-primary">
                                {tc.function_arguments}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    <div className="prose max-w-none wrap-break-word text-sm text-primary">
                      <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {typeof chat?.error === "string" && chat.error.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <p>{chat.error}</p>
            <Button
              disabled={retryMutation.isPending}
              onClick={() => {
                retryMutation.mutate();
              }}
              size="sm"
              variant="secondary"
            >
              {CHATS_TEXT.retry}
            </Button>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Sticky bottom input */}
      <div className="sticky bottom-0 bg-surface pt-2">
        <ChatInputBar
          disabled={
            !chat ||
            sendMessageMutation.isPending ||
            chat.needs_response ||
            messages.some((message) => message.pending)
          }
          onSubmit={(content) => {
            sendMessageMutation.mutate(content);
          }}
        />
      </div>

      {chat && editTitleOpen ? (
        <ChatTitleEditDialog
          chat={{ id: chat.id, title: chat.title }}
          onClose={() => {
            setEditTitleOpen(false);
          }}
          onSaved={() => {
            setEditTitleOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["spa", "chat", chatId] });
            void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
          }}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <Modal
          ariaLabelledby="delete-chat-show-dialog"
          onClose={() => {
            setDeleteConfirmOpen(false);
          }}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <DialogTitle className="text-lg font-medium text-primary" id="delete-chat-show-dialog">
            {CHATS_TEXT.deleteTitle}
          </DialogTitle>
          <p className="mt-2 text-sm text-secondary">{CHATS_TEXT.deleteConfirm}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              onClick={() => {
                setDeleteConfirmOpen(false);
              }}
              variant="secondary"
            >
              {CHATS_TEXT.cancel}
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate();
              }}
              variant="destructive"
            >
              {CHATS_TEXT.deleteChat}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export function ChatNewPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(newChatQueryOptions());
  const [promptSeed, setPromptSeed] = useState("");

  const createMutation = useMutation({
    mutationFn: (content: string) => createChatRequest({ message: content }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
      void navigate({ to: "/chats/$chatId", params: { chatId: detail.id } });
    },
  });
  if (query.data && !query.data.ai_enabled) {
    return (
      <section className="p-4">
        <AiConsentCard
          available={query.data.ai_available}
          onEnabled={() => {
            void queryClient.invalidateQueries({ queryKey: ["spa", "chats"] });
          }}
        />
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col justify-between py-4">
      {query.isError ? <Alert variant="error">{query.error.message}</Alert> : null}
      {createMutation.isError ? (
        <Alert variant="error">{createMutation.error.message}</Alert>
      ) : null}
      <div className="flex items-center justify-between border-b border-tertiary pb-3">
        <div className="flex items-center gap-3">
          <Link
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-inset hover:text-primary"
            to="/chats"
          >
            <Icon name="arrow-left" size="sm" />
          </Link>
          <h1 className="text-base font-medium text-primary">
            {query.data?.chat.title ?? CHATS_TEXT.defaultTitle}
          </h1>
        </div>
      </div>

      <div className="my-auto py-8">
        <AiGreeting
          onSelectQuestion={(q) => {
            setPromptSeed(q);
          }}
        />
      </div>

      <div className="px-2">
        <ChatInputBar
          disabled={createMutation.isPending || query.data?.ai_enabled !== true}
          initialContent={promptSeed}
          key={promptSeed}
          onSubmit={(content) => {
            createMutation.mutate(content);
          }}
        />
      </div>
    </section>
  );
}
