"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "@/features/auth/auth-provider";
import {
  getSubscriptions,
  subscriptionsQueryKey,
} from "./subscription-api";
import styles from "./subscription-list.module.css";

export function SubscriptionList() {
  const auth = useAuth();
  const router = useRouter();
  const isAccountLoading = isAuthSessionLoading(auth.session);
  const isAccountReady = isAuthSessionReady(auth.session);
  const subscriptionsQuery = useQuery({
    enabled: isAccountReady,
    queryKey: subscriptionsQueryKey,
    queryFn: getSubscriptions,
  });

  useEffect(() => {
    if (!isAccountLoading && !isAccountReady) {
      router.replace("/auth");
    }
  }, [isAccountLoading, isAccountReady, router]);

  if (
    isAccountLoading ||
    !isAccountReady ||
    subscriptionsQuery.isPending
  ) {
    return (
      <div
        aria-label="Loading subscriptions"
        className={styles.loading}
        role="status"
      >
        <span />
      </div>
    );
  }

  if (subscriptionsQuery.isError) {
    return (
      <p className={styles.message} role="alert">
        {subscriptionsQuery.error instanceof Error
          ? subscriptionsQuery.error.message
          : "Could not load subscriptions."}
      </p>
    );
  }

  if (subscriptionsQuery.data.length === 0) {
    return (
      <p className={styles.message}>
        Profiles you subscribe to will appear here.
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {subscriptionsQuery.data.map((profile) => (
        <Link
          className={styles.profile}
          href={`/profiles/${encodeURIComponent(profile.username)}`}
          key={profile.profileId}
        >
          <div className={styles.avatar} aria-hidden={!profile.image?.url}>
            {profile.image?.url ? (
              <img alt="" src={profile.image.url} />
            ) : (
              <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className={styles.details}>
            <strong>{profile.displayName}</strong>
            <span>@{profile.username}</span>
            {profile.bio ? <p>{profile.bio}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
