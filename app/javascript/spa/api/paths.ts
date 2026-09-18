import { useRouteContext } from "@tanstack/react-router";
import type { SpaBootstrap } from "../bootstrap";

export function useSpaPaths(): SpaBootstrap {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  return bootstrap;
}
