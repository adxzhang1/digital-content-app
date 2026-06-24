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
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

type ProfilePostGridProps = {
  username: string;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

const getPostImageUrl = (post: ProfilePostDetail | ProfilePostSummary) => {
  if ("media" in post) {
    return post.media.find((item) => item.url)?.url;
  }

  return post.thumbnail?.url;
};

function PostPreview({
  post,
  onOpen,
}: {
  post: ProfilePostSummary;
  onOpen: () => void;
}) {
  const imageUrl = getPostImageUrl(post);

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
  const [postDetails, setPostDetails] = useState<
    Record<string, ProfilePostDetail>
  >({});
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isPostMenuOpen, setIsPostMenuOpen] = useState(false);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

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
        setLikeCounts(
          Object.fromEntries(
            data.posts.map((post) => [post.postId, post.likeCount])
          )
        );
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
  }, [
    isAccountPending,
    isAccountReady,
    username,
  ]);

  const loadPostDetail = useCallback(async (post: ProfilePostSummary) => {
    setPostError(null);

    if (!isAccountReady) {
      return;
    }

    if (postDetails[post.postId]) {
      return;
    }

    setIsLoadingPost(true);

    try {
      const idToken = await getCurrentIdToken();
      const response = await fetch(
        `${apiBaseUrl}/profiles/${username}/posts/${post.postId}`,
        {
          headers: {
            authorization: `Bearer ${idToken}`,
          },
        }
      );
      const data = (await response.json()) as {
        post?: ProfilePostDetail;
        message?: string;
      };

      const detailPost = data.post;

      if (!response.ok || !detailPost) {
        throw new Error(data.message ?? "Could not load post.");
      }

      setPostDetails((currentDetails) => ({
        ...currentDetails,
        [detailPost.postId]: detailPost,
      }));
      setIsPostMenuOpen(false);
      setLikeCounts((currentCounts) => ({
        ...currentCounts,
        [detailPost.postId]: detailPost.likeCount,
      }));
    } catch (error) {
      setPostError(
        error instanceof Error ? error.message : "Could not load post."
      );
    } finally {
      setIsLoadingPost(false);
    }
  }, [isAccountReady, postDetails, username]);

  async function openPost(post: ProfilePostSummary) {
    setViewerPostId(post.postId);
    setPostError(null);
    setIsPostMenuOpen(false);
    await loadPostDetail(post);
  }

  function closeViewer() {
    setViewerPostId(null);
    setIsPostMenuOpen(false);
    setPostError(null);
    setIsLoadingPost(false);
  }

  async function likePost(postId: string) {
    if (likedPostIds.has(postId)) {
      return;
    }

    setLikedPostIds((currentIds) => new Set(currentIds).add(postId));
    setLikeCounts((currentCounts) => ({
      ...currentCounts,
      [postId]: (currentCounts[postId] ?? 0) + 1,
    }));

    if (!isAccountReady) {
      return;
    }

    try {
      const idToken = await getCurrentIdToken();
      const response = await fetch(
        `${apiBaseUrl}/profiles/${username}/posts/${postId}/like`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${idToken}`,
          },
        }
      );
      const data = (await response.json()) as { likes?: string };
      const likes = data.likes;

      if (!response.ok || !likes) {
        throw new Error("Could not like post.");
      }

      setLikeCounts((currentCounts) => ({
        ...currentCounts,
        [postId]: Number(likes.replaceAll(",", "")),
      }));
    } catch {
      setLikedPostIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(postId);
        return nextIds;
      });
      setLikeCounts((currentCounts) => ({
        ...currentCounts,
        [postId]: Math.max((currentCounts[postId] ?? 1) - 1, 0),
      }));
    }
  }

  async function deletePost(
    post: ProfilePostDetail,
    deleteMode: "soft" | "force" = "soft"
  ) {
    if (!isAccountReady || auth.account?.profileId !== post.profileId) {
      return;
    }

    setIsDeletingPost(true);
    setPostError(null);

    try {
      const idToken = await getCurrentIdToken();
      const forceDeleteQuery =
        deleteMode === "force" ? "?deleteMode=force" : "";
      const response = await fetch(
        `${apiBaseUrl}/profiles/${username}/posts/${post.postId}${forceDeleteQuery}`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${idToken}`,
          },
        }
      );
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Could not delete post.");
      }

      setPosts((currentPosts) =>
        currentPosts.filter((currentPost) => currentPost.postId !== post.postId)
      );
      setLikeCounts((currentCounts) => {
        const nextCounts = { ...currentCounts };
        delete nextCounts[post.postId];
        return nextCounts;
      });
      setLikedPostIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(post.postId);
        return nextIds;
      });
      setPostDetails((currentDetails) => {
        const nextDetails = { ...currentDetails };
        delete nextDetails[post.postId];
        return nextDetails;
      });
      setViewerPostId(null);
      setIsPostMenuOpen(false);
    } catch (error) {
      setPostError(
        error instanceof Error ? error.message : "Could not delete post."
      );
    } finally {
      setIsDeletingPost(false);
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
              onOpen={() => void openPost(post)}
              post={post}
            />
          ))}
        </div>
      ) : null}

      {viewerPostId || isLoadingPost || postError ? (
        <PostFeedViewer
          activePostId={viewerPostId}
          currentProfileId={
            isAccountReady ? auth.account?.profileId : undefined
          }
          isDeletingPost={isDeletingPost}
          isLoadingPost={isLoadingPost}
          isPostMenuOpen={isPostMenuOpen}
          likedPostIds={likedPostIds}
          likeCounts={likeCounts}
          onActivePostChange={(post) => {
            setViewerPostId(post.postId);
            setIsPostMenuOpen(false);
            void loadPostDetail(post);
          }}
          onClose={closeViewer}
          onDelete={(post, deleteMode) => void deletePost(post, deleteMode)}
          onLike={(postId) => void likePost(postId)}
          onTogglePostMenu={(postId) => {
            setViewerPostId(postId);
            setIsPostMenuOpen((isOpen) => !isOpen);
          }}
          postDetails={postDetails}
          postError={postError}
          posts={posts}
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
