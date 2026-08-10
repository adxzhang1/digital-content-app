import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import type { Profile } from "@/features/profile/profile-data";

const apiBaseUrl = publicConfig.apiBaseUrl;

type SubscriptionStatusResponse = {
  subscribed?: boolean;
  message?: string;
};

type SubscriptionsResponse = {
  profiles?: Profile[];
  message?: string;
};

export const subscriptionsQueryKey = ["subscriptions"];
export const profileSubscriptionQueryRoot = ["profile-subscription"];

export const profileSubscriptionQueryKey = (profileId: string) => [
  ...profileSubscriptionQueryRoot,
  profileId,
];

async function authorizedRequest(path: string, init?: RequestInit) {
  const idToken = await getCurrentIdToken();

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getProfileSubscription(profileId: string) {
  const response = await authorizedRequest(
    `/subscriptions/profile/${encodeURIComponent(profileId)}`
  );
  const data = (await response.json()) as SubscriptionStatusResponse;

  if (!response.ok || typeof data.subscribed !== "boolean") {
    throw new Error(data.message ?? "Could not load subscription.");
  }

  return data.subscribed;
}

export async function updateProfileSubscription({
  profileId,
  subscribe,
}: {
  profileId: string;
  subscribe: boolean;
}) {
  const response = await authorizedRequest(
    `/subscriptions/profile/${encodeURIComponent(profileId)}`,
    {
      method: subscribe ? "PUT" : "DELETE",
    }
  );
  const data = (await response.json()) as SubscriptionStatusResponse;

  if (!response.ok || typeof data.subscribed !== "boolean") {
    throw new Error(data.message ?? "Could not update subscription.");
  }

  return data.subscribed;
}

export async function getSubscriptions() {
  const response = await authorizedRequest("/me/subscriptions");
  const data = (await response.json()) as SubscriptionsResponse;

  if (!response.ok || !Array.isArray(data.profiles)) {
    throw new Error(data.message ?? "Could not load subscriptions.");
  }

  return data.profiles;
}
