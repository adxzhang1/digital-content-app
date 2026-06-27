"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "../../auth-provider";
import { AuthFlow } from "../../auth/auth-flow";
import styles from "./page.module.css";
import {
  fetchProfilePosts,
  profilePostsQueryKey,
} from "@/features/profile/profile-post-api";
import { PostFeedViewer } from "./post-feed-viewer";
import type { ProfilePostSummary } from "@/features/profile/profile-data";

type ProfilePostGridProps = {
  username: string;
};

function PostPreview({
  post,
  onOpen,
}: {
  post: ProfilePostSummary;
  onOpen: () => void;
}) {
  const imageUrl = post.thumbnail?.url;

  return (
    <button
      aria-label="Open post"
      className={styles.post}
      onClick={onOpen}
      type="button"
    >
      {imageUrl ? (
        <img alt="" className={styles.postImage} src={imageUrl} />
      ) : null}
    </button>
  );
}

export function ProfilePostGrid({
  username,
}: ProfilePostGridProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAccountReady = isAuthSessionReady(auth.session);
  const isAccountPending = isAuthSessionLoading(auth.session);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const postsQuery = useQuery({
    enabled: isAccountReady,
    queryKey: profilePostsQueryKey(username),
    queryFn: () => fetchProfilePosts(username),
  });
  const posts = postsQuery.data ?? [];

  function openPost(post: ProfilePostSummary) {
    setViewerPostId(post.postId);
  }

  function closeViewer() {
    setViewerPostId(null);
  }

  function removePost(postId: string) {
    queryClient.setQueryData<ProfilePostSummary[]>(
      profilePostsQueryKey(username),
      (currentPosts = []) =>
        currentPosts.filter((currentPost) => currentPost.postId !== postId)
    );

    if (viewerPostId === postId) {
      setViewerPostId(null);
    }
  }

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
              key={post.postId}
              onOpen={() => openPost(post)}
              post={post}
            />
          ))}
        </div>
      ) : null}

      {viewerPostId ? (
        <PostFeedViewer
          initialPostId={viewerPostId}
          onClose={closeViewer}
          onPostDeleted={removePost}
          posts={posts}
          username={username}
        />
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
