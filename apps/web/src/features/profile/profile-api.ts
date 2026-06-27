import { publicConfig } from "@/lib/config";
import type { Profile } from "./profile-data";

const apiBaseUrl = publicConfig.apiBaseUrl;

export const profileQueryKey = (username: string) => ["profile", username];

export async function getProfile(
  username: string,
  init?: RequestInit
): Promise<Profile | null> {
  const response = await fetch(`${apiBaseUrl}/profiles/${username}`, init);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not load profile.");
  }

  const data = (await response.json()) as {
    profile?: Profile;
    message?: string;
  };

  if (!data.profile) {
    throw new Error(data.message ?? "Could not load profile.");
  }

  return data.profile;
}
