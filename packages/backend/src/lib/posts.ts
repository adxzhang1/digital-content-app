import { getSignedCloudFrontUrl } from "./media-signer.js";
import type { MediaSigningConfig } from "./media-signer.js";

type RawPost = Record<string, unknown>;

type RawMedia = Record<string, unknown>;

const processedMediaPrefix = "posts/processed/";

const getProcessedMediaUrl = (
  signingConfig: Pick<MediaSigningConfig, "baseUrl">,
  processedKey: unknown
) => {
  if (typeof processedKey !== "string" || processedKey.length === 0) {
    return undefined;
  }

  const mediaPath = processedKey.startsWith(processedMediaPrefix)
    ? processedKey.slice(processedMediaPrefix.length)
    : processedKey;
  const encodedPath = mediaPath.split("/").map(encodeURIComponent).join("/");

  return `${signingConfig.baseUrl.replace(/\/$/, "")}/${encodedPath}`;
};

export const getSignedProcessedMediaUrl = async (
  signingConfig: MediaSigningConfig,
  processedKey: unknown
) => {
  const url = getProcessedMediaUrl(signingConfig, processedKey);

  if (!url) {
    return undefined;
  }

  return getSignedCloudFrontUrl(url, signingConfig);
};

const toMediaResponse = async (
  media: unknown,
  signingConfig: MediaSigningConfig
) => {
  if (!Array.isArray(media)) {
    return [];
  }

  return Promise.all(
    (media as RawMedia[]).map(async (item) => ({
      mediaId: String(item.mediaId),
      position: Number(item.position ?? 0),
      type: String(item.type ?? "IMAGE"),
      processedKey:
        typeof item.processedKey === "string" ? item.processedKey : undefined,
      url: await getSignedProcessedMediaUrl(signingConfig, item.processedKey),
      width: Number(item.width ?? 0),
      height: Number(item.height ?? 0)
    }))
  );
};

export const toPostResponse = async (
  post: RawPost,
  signingConfig: MediaSigningConfig
) => ({
  postId: String(post.postId),
  profileId: String(post.profileId),
  caption: String(post.caption ?? ""),
  status: String(post.status ?? "READY"),
  media: await toMediaResponse(post.media, signingConfig),
  createdAt: String(post.createdAt),
  updatedAt: String(post.updatedAt ?? post.createdAt),
  likeCount: Number(post.likeCount ?? 0)
});
