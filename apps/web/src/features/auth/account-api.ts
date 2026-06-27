import type { User } from "firebase/auth";
import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";

export type AppAccount = {
  userId: string;
  profileId: string;
  username: string;
  displayName: string;
  email: string;
};

type MeResponse = {
  status?: "ready" | "needs_onboarding";
  user?: AppAccount;
  message?: string;
};

export type AccountResponse =
  | { status: "needs_onboarding" }
  | { status: "ready"; user: AppAccount };

const apiBaseUrl = publicConfig.apiBaseUrl;

export const accountQueryKey = (firebaseUid: string) => [
  "account",
  firebaseUid,
];

export async function fetchAccount(
  firebaseUser: User,
  options?: {
    forceTokenRefresh?: boolean;
  }
): Promise<AccountResponse> {
  const idToken = await firebaseUser.getIdToken(options?.forceTokenRefresh);
  const response = await fetch(`${apiBaseUrl}/me`, {
    headers: {
      authorization: `Bearer ${idToken}`,
    },
  });
  const data = (await response.json()) as MeResponse;

  if (!response.ok) {
    throw new Error(data.message ?? "Could not load account.");
  }

  if (data.status === "needs_onboarding") {
    return {
      status: "needs_onboarding",
    };
  }

  if (data.status !== "ready" || !data.user) {
    throw new Error("Could not load account.");
  }

  return {
    status: "ready",
    user: data.user,
  };
}

export async function completeOnboarding({
  displayName,
  username,
}: {
  displayName: string;
  username: string;
}) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/me/onboarding`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username,
      displayName,
    }),
  });
  const data = (await response.json()) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "Could not create account profile.");
  }
}
