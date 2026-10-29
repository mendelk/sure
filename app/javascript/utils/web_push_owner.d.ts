export interface WebPushSessionOptions {
  userId: string;
  sessionId: string;
  enabled: boolean;
  configured: boolean;
  createUrl: string;
}

export function initializeWebPushOwnerSession(
  options: WebPushSessionOptions,
  saveSubscription: (url: string, subscription: PushSubscription) => Promise<unknown>,
): () => void;
export function subscriptionFingerprint(subscription: PushSubscription): Promise<string>;
export function rememberWebPushOwner(userId: string, sessionId: string, subscription: PushSubscription): Promise<void>;
