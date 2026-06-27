import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";

export type PostProcessingStatus =
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "DELETED";

export type UploadMedia = {
  mediaId: string;
  position: number;
  type: "IMAGE";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  originalKey: string;
  uploadUrl: string;
};

export type PostStatus = {
  postId: string;
  profileId: string;
  status: PostProcessingStatus;
  media: unknown[];
  createdAt: string;
  updatedAt: string;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

export async function getPostUploadUrls({
  files,
  profileId,
}: {
  files: File[];
  profileId: string;
}) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/posts/upload-urls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      profileId,
      images: files.map((file) => ({
        contentType: file.type,
      })),
    }),
  });
  const data = (await response.json()) as {
    postId?: string;
    media?: UploadMedia[];
    message?: string;
  };

  if (!response.ok || !data.postId || !data.media) {
    throw new Error(data.message ?? "Could not prepare uploads.");
  }

  return {
    idToken,
    media: data.media,
    postId: data.postId,
  };
}

export function uploadFile(
  file: File,
  uploadUrl: string,
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }

      reject(new Error("Image upload failed."));
    });
    request.addEventListener("error", () =>
      reject(new Error("Image upload failed."))
    );
    request.open("PUT", uploadUrl);
    request.setRequestHeader("content-type", file.type);
    request.send(file);
  });
}

export async function createPost({
  caption,
  idToken,
  media,
  postId,
  profileId,
}: {
  caption: string;
  idToken: string;
  media: UploadMedia[];
  postId: string;
  profileId: string;
}) {
  const response = await fetch(`${apiBaseUrl}/posts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      postId,
      profileId,
      caption,
      media: media.map((mediaItem) => ({
        mediaId: mediaItem.mediaId,
        position: mediaItem.position,
        type: mediaItem.type,
        originalKey: mediaItem.originalKey,
        contentType: mediaItem.contentType,
      })),
    }),
  });
  const data = (await response.json()) as {
    post?: unknown;
    message?: string;
  };

  if (!response.ok || !data.post) {
    throw new Error(data.message ?? "Could not create post.");
  }
}

export async function waitForPostStatus(
  postId: string,
  idToken: string
): Promise<PostStatus> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${apiBaseUrl}/posts/${postId}`, {
      headers: {
        authorization: `Bearer ${idToken}`,
      },
    });
    const data = (await response.json()) as {
      post?: PostStatus;
      message?: string;
    };

    if (!response.ok || !data.post) {
      throw new Error(data.message ?? "Could not load post status.");
    }

    if (
      data.post.status === "READY" ||
      data.post.status === "FAILED" ||
      data.post.status === "DELETED"
    ) {
      return data.post;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Post is still processing. Check back shortly.");
}
