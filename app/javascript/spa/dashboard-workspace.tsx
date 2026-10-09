import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as z from "zod/mini";
import {
  DashboardLayoutSchema,
  loadOrInstallStarterSnapshot,
  writeDashboardSnapshot,
  type DashboardLayoutData,
  type DashboardSnapshot,
} from "./dashboard-storage";
import { DashboardIdSchema, type DashboardId, type UserId } from "./ids";

type LayoutDrafts = Partial<Record<DashboardId, DashboardLayoutData>>;
type DashboardWorkspace = {
  snapshot: DashboardSnapshot;
  updateSnapshot: (update: (current: DashboardSnapshot) => DashboardSnapshot) => void;
  layoutDrafts: LayoutDrafts;
  setLayoutDraft: (dashboardId: DashboardId, layout: DashboardLayoutData | null) => void;
};

const DashboardWorkspaceContext = createContext<DashboardWorkspace | null>(null);
const LayoutDraftsSchema = z.record(DashboardIdSchema, DashboardLayoutSchema);

function draftStorageKey(userId: UserId): string {
  return `sure:dashboard-layout-drafts:${userId}`;
}

function readLayoutDrafts(userId: UserId): LayoutDrafts {
  try {
    const raw = window.sessionStorage.getItem(draftStorageKey(userId));
    if (raw === null) return {};
    const parsed = LayoutDraftsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    window.sessionStorage.removeItem(draftStorageKey(userId));
  } catch {
    // Invalid JSON and unavailable storage both start with an empty in-memory draft.
    try {
      window.sessionStorage.removeItem(draftStorageKey(userId));
    } catch {
      // Browser storage is optional; route navigation still keeps provider state.
    }
  }
  return {};
}

function writeLayoutDrafts(userId: UserId, drafts: LayoutDrafts): void {
  try {
    window.sessionStorage.setItem(draftStorageKey(userId), JSON.stringify(drafts));
  } catch {
    // Private mode and quota errors must not interrupt editing or navigation.
  }
}

export function DashboardWorkspaceProvider({
  userId,
  children,
}: {
  userId: UserId;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(() => loadOrInstallStarterSnapshot(userId));
  const snapshotRef = useRef(snapshot);
  const [layoutDrafts, setLayoutDrafts] = useState(() => readLayoutDrafts(userId));
  const draftsRef = useRef(layoutDrafts);
  const updateSnapshot = useCallback(
    (update: (current: DashboardSnapshot) => DashboardSnapshot) => {
      const next = update(snapshotRef.current);
      snapshotRef.current = next;
      setSnapshot(next);
      writeDashboardSnapshot(userId, next);
    },
    [userId],
  );
  const setLayoutDraft = useCallback(
    (dashboardId: DashboardId, layout: DashboardLayoutData | null) => {
      const next = { ...draftsRef.current };
      if (layout === null) delete next[dashboardId];
      else next[dashboardId] = layout;
      draftsRef.current = next;
      setLayoutDrafts(next);
      // Write before navigation so a reload on a source page restores the same draft.
      writeLayoutDrafts(userId, next);
    },
    [userId],
  );
  const value = useMemo(
    () => ({ snapshot, updateSnapshot, layoutDrafts, setLayoutDraft }),
    [snapshot, updateSnapshot, layoutDrafts, setLayoutDraft],
  );
  return (
    <DashboardWorkspaceContext.Provider value={value}>
      {children}
    </DashboardWorkspaceContext.Provider>
  );
}

export function useDashboardWorkspace(): DashboardWorkspace {
  const workspace = useContext(DashboardWorkspaceContext);
  if (workspace === null) throw new Error("DashboardWorkspaceProvider is required");
  return workspace;
}
