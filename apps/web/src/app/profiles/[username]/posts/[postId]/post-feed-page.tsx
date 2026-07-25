"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "@/app/auth-provider";
import { AuthFlow } from "@/app/auth/auth-flow";
import {
  fetchProfilePosts,
  profilePostsQueryKey,
} from "@/features/profile/profile-post-api";
import { PostFeedViewer } from "@/features/post-feed/post-feed-viewer";
import styles from "./post-feed-page.module.css";
import profileStyles from "../../page.module.css";
import type { ProfilePostSummary } from "@/features/profile/profile-data";

type PostFeedPageProps = {
  initialPostId: string;
  username: string;
};

export function PostFeedPage({
  initialPostId,
  username,
}: PostFeedPageProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isAccountReady = isAuthSessionReady(auth.session);
  const isAccountPending = isAuthSessionLoading(auth.session);
  const postsQuery = useQuery({
    enabled: isAccountReady,
    queryKey: profilePostsQueryKey(username),
    queryFn: () => fetchProfilePosts(username),
  });
  const posts = postsQuery.data ?? [];
  const hasInitialPost = posts.some((post) => post.postId === initialPostId);

  const closeFeed = useCallback(() => {
    router.back();
  }, [router]);

  const removePost = useCallback(
    (postId: string) => {
      queryClient.setQueryData<ProfilePostSummary[]>(
        profilePostsQueryKey(username),
        (currentPosts = []) =>
          currentPosts.filter((currentPost) => currentPost.postId !== postId)
      );
      router.replace("/me");
    },
    [queryClient, router, username]
  );

  const handleActivePostChange = useCallback(
    (postId: string) => {
      const postPath = `/profiles/${encodeURIComponent(username)}/posts/${encodeURIComponent(postId)}`;

      if (postPath === `${window.location.pathname}${window.location.search}`) {
        return;
      }

      window.history.replaceState(window.history.state, "", postPath);
    },
    [username]
  );

  const handleAuthReady = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: profilePostsQueryKey(username),
    });
  }, [queryClient, username]);

  if (isAccountPending || (isAccountReady && postsQuery.isPending)) {
    return (
      <div className={styles.pageBackdrop}>
        <div className={profileStyles.loadingPosts} role="status">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
      </div>
    );
  }

  if (!isAccountReady) {
    return (
      <div
        aria-label="Log in"
        aria-modal="true"
        className={profileStyles.authModalBackdrop}
        role="dialog"
      >
        <section className={profileStyles.authModal}>
          <button
            aria-label="Close login"
            className={profileStyles.authModalClose}
            onClick={closeFeed}
            type="button"
          >
            ×
          </button>
          <AuthFlow onReady={handleAuthReady} />
        </section>
      </div>
    );
  }

  if (postsQuery.isError || !hasInitialPost) {
    return (
      <div className={styles.pageBackdrop}>
        <div className={profileStyles.locked}>
          <button
            className={profileStyles.authLink}
            onClick={closeFeed}
            type="button"
          >
            {postsQuery.error instanceof Error
              ? postsQuery.error.message
              : "Post not found."}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.scrollSurface} aria-hidden="true" />
      <PostFeedViewer
        initialPostId={initialPostId}
        onActivePostChange={handleActivePostChange}
        onClose={closeFeed}
        onPostDeleted={removePost}
        posts={posts}
        username={username}
      />
    </>
  );
}
