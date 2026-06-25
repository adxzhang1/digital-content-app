"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "../../auth-provider";
import { AuthFlow } from "../../auth/auth-flow";
import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import styles from "./page.module.css";
import { PostFeedViewer } from "./post-feed-viewer";
import type { ProfilePostSummary } from "./profile-data";

type ProfilePostGridProps = {
  username: string;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

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
  const isAccountReady = isAuthSessionReady(auth.session);
  const isAccountPending = isAuthSessionLoading(auth.session);
  const [posts, setPosts] = useState<ProfilePostSummary[]>([]);
  const [postsError, setPostsError] = useState("");
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (isAccountPending) {
      return;
    }

    if (!isAccountReady) {
      return;
    }

    let isActive = true;

    async function loadPosts() {
      setIsLoadingPosts(true);
      setPostsError("");

      try {
        const idToken = await getCurrentIdToken();
        const response = await fetch(`${apiBaseUrl}/profiles/${username}/posts`, {
          headers: {
            authorization: `Bearer ${idToken}`,
          },
        });
        const data = (await response.json()) as {
          posts?: ProfilePostSummary[];
          message?: string;
        };

        if (!response.ok || !data.posts) {
          throw new Error(data.message ?? "Could not load posts.");
        }

        if (!isActive) {
          return;
        }

        setPosts(data.posts);
        setPostsError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPostsError(
          error instanceof Error ? error.message : "Could not load posts."
        );
      } finally {
        if (isActive) {
          setIsLoadingPosts(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isActive = false;
    };
  }, [isAccountPending, isAccountReady, username]);

  function openPost(post: ProfilePostSummary) {
    setViewerPostId(post.postId);
  }

  function closeViewer() {
    setViewerPostId(null);
  }

  function removePost(postId: string) {
    setPosts((currentPosts) =>
      currentPosts.filter((currentPost) => currentPost.postId !== postId)
    );

    if (viewerPostId === postId) {
      setViewerPostId(null);
    }
  }

  const handleAuthReady = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const showPostsLoading = isAccountPending || (isAccountReady && isLoadingPosts);
  const needsAccount = !isAccountReady;
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
