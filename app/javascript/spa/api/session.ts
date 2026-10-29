import { apiFetch } from "./client";

export async function signOut(): Promise<string> {
  const response = await apiFetch("/api/v1/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Unable to log out. Please try again.");
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("redirect_url" in result) ||
    typeof result.redirect_url !== "string"
  )
    throw new Error("Unable to log out. Please try again.");

  return result.redirect_url;
}
