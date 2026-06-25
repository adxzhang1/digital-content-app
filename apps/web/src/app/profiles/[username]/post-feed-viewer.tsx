"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VirtualFeed } from "@/features/feed/virtual-feed";
import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import { isAuthSessionReady, useAuth } from "../../auth-provider";
import { PostFeedItem, type DeleteMode } from "./post-feed-item";
import styles from "./post-feed-viewer.module.css";
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

type PostFeedViewerProps = {
  initialPostId: string;
  onClose: () => void;
  onPostDeleted: (postId: string) => void;
  posts: ProfilePostSummary[];
  username: string;
};

type FeedPost = ProfilePostSummary & {
  id: string;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

export function PostFeedViewer({
  initialPostId,
  onClose,
  onPostDeleted,
  posts,
  username,
}: PostFeedViewerProps) {
  const auth = useAuth();
  const isAccountReady = isAuthSessionReady(auth.session);
  const currentProfileId = isAccountReady ? auth.account?.profileId : undefined;
  const [activePostId, setActivePostId] = useState(initialPostId);
  const [postDetails, setPostDetails] = useState<
    Record<string, ProfilePostDetail>
  >({});
  const [postError, setPostError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [isImageCover, setIsImageCover] = useState(false);
  const feedPosts = useMemo(
    () => posts.map((post) => ({ ...post, id: post.postId })),
    [posts]
  );
  const activePost = useMemo(
    () => posts.find((post) => post.postId === activePostId),
    [activePostId, posts]
  );
  const activePostDetail = activePost ? postDetails[activePost.postId] : null;
  const handleToggleImageFit = useCallback(() => {
    setIsImageCover((currentValue) => !currentValue);
  }, []);
  const handleActivePostChange = useCallback(
    (post: FeedPost) => {
      setActivePostId(post.postId);
      setPostError(null);
    },
    []
  );
  const handleLikePost = useCallback(
    async (postId: string) => {
      if (likedPostIds.has(postId)) {
        return;
      }

      setLikedPostIds((currentIds) => new Set(currentIds).add(postId));

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
        const data = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(data.message ?? "Could not like post.");
        }
      } catch {
        setLikedPostIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(postId);
          return nextIds;
        });
      }
    },
    [isAccountReady, likedPostIds, username]
  );
  const handleDeletePost = useCallback(
    async (post: ProfilePostDetail, deleteMode: DeleteMode = "soft") => {
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
        onPostDeleted(post.postId);
        onClose();
      } catch (error) {
        setPostError(
          error instanceof Error ? error.message : "Could not delete post."
        );
      } finally {
        setIsDeletingPost(false);
      }
    },
    [
      auth.account?.profileId,
      isAccountReady,
      onClose,
      onPostDeleted,
      username,
    ]
  );

  useEffect(() => {
    if (!activePost || !isAccountReady || activePostDetail) {
      return;
    }

    let isActive = true;
    const postToLoad = activePost;

    async function loadActivePostDetail() {
      try {
        const idToken = await getCurrentIdToken();
        const response = await fetch(
          `${apiBaseUrl}/profiles/${username}/posts/${postToLoad.postId}`,
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

        if (!isActive) {
          return;
        }

        setPostDetails((currentDetails) => ({
          ...currentDetails,
          [detailPost.postId]: detailPost,
        }));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPostError(
          error instanceof Error ? error.message : "Could not load post."
        );
      }
    }

    void loadActivePostDetail();

    return () => {
      isActive = false;
    };
  }, [activePost, activePostDetail, isAccountReady, username]);
  const renderFeedPost = useCallback(
    (post: FeedPost, { isActive }: { isActive: boolean }) => {
      const detailPost = postDetails[post.postId];
      const resolvedPost = detailPost ?? post;
      const canManagePost =
        detailPost && currentProfileId === detailPost.profileId;
      const isLiked = likedPostIds.has(post.postId);
      const likeCount = resolvedPost.likeCount + (isLiked ? 1 : 0);

      return (
        <PostFeedItem
          canManagePost={Boolean(canManagePost)}
          isImageCover={isImageCover}
          isDeletingPost={isDeletingPost}
          isActive={isActive}
          isLiked={isLiked}
          likeCount={likeCount}
          onDelete={(post, deleteMode) => void handleDeletePost(post, deleteMode)}
          onToggleImageFit={handleToggleImageFit}
          onLike={(postId) => void handleLikePost(postId)}
          post={post}
          postError={
            postError && post.postId === activePostId ? postError : null
          }
          resolvedPost={resolvedPost}
        />
      );
    },
    [
      activePostId,
      currentProfileId,
      handleDeletePost,
      handleLikePost,
      handleToggleImageFit,
      isDeletingPost,
      isImageCover,
      likedPostIds,
      postDetails,
      postError,
    ]
  );

  return (
    <div
      aria-label="Feed"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <article className={styles.modal}>
        <div className={styles.feedShell}>
          <VirtualFeed
            activeItemId={activePostId}
            ariaLabel="Post feed"
            items={feedPosts}
            onActiveItemChange={handleActivePostChange}
            renderItem={renderFeedPost}
          />
          <button
            aria-label="Close post"
            className={styles.modalClose}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </article>
    </div>
  );
}
