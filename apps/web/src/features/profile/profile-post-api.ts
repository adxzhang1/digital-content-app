import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

const apiBaseUrl = publicConfig.apiBaseUrl;

export const profilePostsQueryRoot = ["profile-posts"];

export const postDetailQueryRoot = ["post-detail"];

export const profilePostsQueryKey = (username: string) => [
  ...profilePostsQueryRoot,
  username,
];

export const postDetailQueryKey = (username: string, postId: string) => [
  ...postDetailQueryRoot,
  username,
  postId,
];

export async function fetchProfilePosts(username: string) {
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

  return data.posts;
}

export async function fetchPostDetail(username: string, postId: string) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(
    `${apiBaseUrl}/profiles/${username}/posts/${postId}`,
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

  if (!response.ok || !data.post) {
    throw new Error(data.message ?? "Could not load post.");
  }

  return data.post;
}

export async function likePost(username: string, postId: string) {
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
}

export async function deletePost({
  deleteMode = "soft",
  post,
  username,
}: {
  deleteMode?: "soft" | "force";
  post: ProfilePostDetail;
  username: string;
}) {
  const idToken = await getCurrentIdToken();
  const forceDeleteQuery = deleteMode === "force" ? "?deleteMode=force" : "";
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
}
