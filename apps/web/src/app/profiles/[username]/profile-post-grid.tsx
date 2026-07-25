"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "@/features/auth/auth-provider";
import { AuthFlow } from "../../auth/auth-flow";
import styles from "./page.module.css";
import {
  fetchProfilePosts,
  profilePostsQueryKey,
} from "@/features/profile/profile-post-api";
import type { ProfilePostSummary } from "@/features/profile/profile-data";

type ProfilePostGridProps = {
  username: string;
};

function PostPreview({
  href,
  post,
}: {
  href: string;
  post: ProfilePostSummary;
}) {
  const imageUrl = post.thumbnail?.url;

  return (
    <Link
      aria-label="Open post"
      className={styles.post}
      href={href}
    >
      {imageUrl ? (
        <img alt="" className={styles.postImage} src={imageUrl} />
      ) : null}
    </Link>
  );
}

export function ProfilePostGrid({
  username,
}: ProfilePostGridProps) {
  const auth = useAuth();
  const isAccountReady = isAuthSessionReady(auth.session);
  const isAccountPending = isAuthSessionLoading(auth.session);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const postsQuery = useQuery({
    enabled: isAccountReady,
    queryKey: profilePostsQueryKey(username),
    queryFn: () => fetchProfilePosts(username),
  });
  const posts = postsQuery.data ?? [];

  const handleAuthReady = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const showPostsLoading =
    isAccountPending || (isAccountReady && postsQuery.isPending);
  const needsAccount = !isAccountReady;
  const postsError =
    postsQuery.error instanceof Error ? postsQuery.error.message : "";
  const postsMessage = needsAccount ? "Subscribe" : postsError;
  return (
    <>
      {showPostsLoading ? (
        <div
          aria-label="Loading posts"
          className={styles.loadingPosts}
          role="status"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
      ) : postsMessage ? (
        <div className={styles.locked}>
          <button
            className={styles.authLink}
            onClick={needsAccount ? () => setIsAuthModalOpen(true) : undefined}
            type="button"
          >
            {postsMessage}
          </button>
        </div>
      ) : null}

      {!postsMessage ? (
        <div className={styles.grid}>
          {posts.map((post) => (
            <PostPreview
              href={`/profiles/${encodeURIComponent(username)}/posts/${encodeURIComponent(post.postId)}`}
              key={post.postId}
              post={post}
            />
          ))}
        </div>
      ) : null}

      {isAuthModalOpen ? (
        <div
          aria-label="Log in"
          aria-modal="true"
          className={styles.authModalBackdrop}
          role="dialog"
        >
          <section className={styles.authModal}>
            <button
              aria-label="Close login"
              className={styles.authModalClose}
              onClick={() => setIsAuthModalOpen(false)}
              type="button"
            >
              ×
            </button>
            <AuthFlow onReady={handleAuthReady} />
          </section>
        </div>
      ) : null}
    </>
  );
}
