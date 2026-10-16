export interface WebPushSessionOptions {
  userId: string;
  sessionId: string;
  enabled: boolean;
  configured: boolean;
  createUrl: string;
}

export function initializeWebPushSession(options: WebPushSessionOptions): () => void;
export function subscriptionFingerprint(subscription: PushSubscription): Promise<string>;
export function pushRequest(url: string, method: string, body?: unknown): Promise<Record<string, unknown>>;
export function saveSubscription(createUrl: string, subscription: PushSubscription): Promise<{ id: string; status: string | null }>;
export function rememberWebPushOwner(userId: string, sessionId: string, subscription: PushSubscription): Promise<void>;
