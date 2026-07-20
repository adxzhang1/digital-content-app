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
  type: "IMAGE" | "VIDEO";
  contentType:
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "video/mp4"
    | "video/quicktime"
    | "video/webm";
  originalKey: string;
  upload: {
    url: string;
    fields: Record<string, string>;
  };
};

export type PostStatus = {
  postId: string;
  profileId: string;
  status: PostProcessingStatus;
  createdAt: string;
  updatedAt: string;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

export async function createPostUpload({
  files,
  profileId,
}: {
  files: File[];
  profileId: string;
}) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/posts/upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      profileId,
      media: files.map((file) => ({
        contentType: file.type,
        sizeBytes: file.size,
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
  upload: UploadMedia["upload"],
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();

    Object.entries(upload.fields).forEach(([name, value]) => {
      formData.append(name, value);
    });
    formData.append("file", file);

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

      reject(new Error("Media upload failed."));
    });
    request.addEventListener("error", () =>
      reject(new Error("Media upload failed."))
    );
    request.open("POST", upload.url);
    request.send(formData);
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
