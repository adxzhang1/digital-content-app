"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "@/features/auth/auth-provider";
import {
  getProfileSubscription,
  profileSubscriptionQueryKey,
  subscriptionsQueryKey,
  updateProfileSubscription,
} from "./subscription-api";
import styles from "./profile-subscription-button.module.css";

type ProfileSubscriptionButtonProps = {
  profileId: string;
};

export function ProfileSubscriptionButton({
  profileId,
}: ProfileSubscriptionButtonProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isAccountReady = isAuthSessionReady(auth.session);
  const isOwnProfile = auth.account?.profileId === profileId;
  const subscriptionQuery = useQuery({
    enabled: isAccountReady && !isOwnProfile,
    queryKey: profileSubscriptionQueryKey(profileId),
    queryFn: () => getProfileSubscription(profileId),
  });
  const subscriptionMutation = useMutation({
    mutationFn: updateProfileSubscription,
    onSuccess: (subscribed) => {
      queryClient.setQueryData(
        profileSubscriptionQueryKey(profileId),
        subscribed
      );
      void queryClient.invalidateQueries({
        queryKey: subscriptionsQueryKey,
      });
    },
  });

  if (isOwnProfile) {
    return null;
  }

  const isLoading =
    isAuthSessionLoading(auth.session) ||
    (isAccountReady && subscriptionQuery.isPending);
  const isSubscribed = subscriptionQuery.data ?? false;
  const error =
    subscriptionMutation.error instanceof Error
      ? subscriptionMutation.error.message
      : subscriptionQuery.error instanceof Error
        ? subscriptionQuery.error.message
        : "";

  function handleClick() {
    if (!isAccountReady) {
      router.push("/auth");
      return;
    }

    subscriptionMutation.mutate({
      profileId,
      subscribe: !isSubscribed,
    });
  }

  return (
    <div className={styles.action}>
      <button
        aria-pressed={isAccountReady ? isSubscribed : undefined}
        className={isSubscribed ? styles.subscribed : styles.subscribe}
        disabled={
          isLoading ||
          subscriptionQuery.isError ||
          subscriptionMutation.isPending
        }
        onClick={handleClick}
        type="button"
      >
        {subscriptionMutation.isPending
          ? "Updating..."
          : isSubscribed
            ? "Subscribed"
            : "Subscribe"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
