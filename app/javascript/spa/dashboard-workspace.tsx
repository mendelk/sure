import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadOrInstallStarterSnapshot,
  writeDashboardSnapshot,
  type DashboardSnapshot,
} from "./dashboard-storage";
import type { UserId } from "./ids";

type DashboardWorkspace = {
  snapshot: DashboardSnapshot;
  updateSnapshot: (update: (current: DashboardSnapshot) => DashboardSnapshot) => void;
};

const DashboardWorkspaceContext = createContext<DashboardWorkspace | null>(null);

export function DashboardWorkspaceProvider({
  userId,
  children,
}: {
  userId: UserId;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(() => loadOrInstallStarterSnapshot(userId));
  const snapshotRef = useRef(snapshot);
  const updateSnapshot = useCallback(
    (update: (current: DashboardSnapshot) => DashboardSnapshot) => {
      const next = update(snapshotRef.current);
      snapshotRef.current = next;
      setSnapshot(next);
      writeDashboardSnapshot(userId, next);
    },
    [userId],
  );
  const value = useMemo(() => ({ snapshot, updateSnapshot }), [snapshot, updateSnapshot]);
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
