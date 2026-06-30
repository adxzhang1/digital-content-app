import {
  getSignedCloudFrontUrl,
  getSignedCloudFrontUrlWithPolicy
} from "./media-signer.js";
import type { MediaSigningConfig } from "./media-signer.js";

type RawPost = Record<string, unknown>;

type RawMedia = Record<string, unknown>;

const toRenditionResponse = (rendition: unknown) => {
  if (!rendition || typeof rendition !== "object") {
    return undefined;
  }

  const item = rendition as Record<string, unknown>;
  const width = Number(item.Width ?? item.width ?? 0);
  const height = Number(item.Height ?? item.height ?? 0);
  const response = {
    ...(width > 0 ? { width } : {}),
    ...(height > 0 ? { height } : {})
  };

  return Object.keys(response).length > 0 ? response : undefined;
};

const toRenditionsResponse = (renditions: unknown) => {
  if (!renditions || typeof renditions !== "object") {
    return undefined;
  }

  const response = Object.fromEntries(
    Object.entries(renditions as Record<string, unknown>)
      .map(([name, rendition]) => [name, toRenditionResponse(rendition)])
      .filter((entry): entry is [string, { width?: number; height?: number }] =>
        Boolean(entry[1])
      )
  );

  return Object.keys(response).length > 0 ? response : undefined;
};

const getSignedUrlResponse = async (
  signingConfig: MediaSigningConfig,
  key: unknown
) =>
  typeof key === "string" && key.length > 0
    ? await getSignedProcessedMediaUrl(signingConfig, key)
    : undefined;

export const getProcessedMediaUrl = (
  signingConfig: Pick<MediaSigningConfig, "baseUrl">,
  processedKey: unknown
) => {
  if (typeof processedKey !== "string" || processedKey.length === 0) {
    return undefined;
  }

  const encodedPath = processedKey.split("/").map(encodeURIComponent).join("/");

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

const getSignedHlsManifestUrl = async (
  signingConfig: MediaSigningConfig,
  playlistKey: string,
  hlsPrefix: string
) => {
  const playlistUrl = getProcessedMediaUrl(signingConfig, playlistKey);

  if (!playlistUrl) {
    return undefined;
  }

  return getSignedCloudFrontUrlWithPolicy({
    config: signingConfig,
    resourceUrl: `${signingConfig.baseUrl.replace(/\/$/, "")}/${hlsPrefix}/*.m3u8`,
    url: playlistUrl
  });
};

const toMediaResponse = async (
  media: unknown,
  signingConfig: MediaSigningConfig
) => {
  if (!Array.isArray(media)) {
    return [];
  }

  return Promise.all(
    (media as RawMedia[]).map(async (item) => {
      const playlistKey =
        typeof item.playlistKey === "string" ? item.playlistKey : undefined;
      const hlsPrefix =
        typeof item.hlsPrefix === "string" ? item.hlsPrefix : undefined;
      const thumbnailKey =
        typeof item.thumbnailKey === "string" ? item.thumbnailKey : undefined;
      const processedKey =
        typeof item.processedKey === "string" ? item.processedKey : undefined;
      const renditions = toRenditionsResponse(item.renditions);
      const hlsUrl =
        playlistKey && hlsPrefix
          ? await getSignedHlsManifestUrl(signingConfig, playlistKey, hlsPrefix)
          : undefined;
      const mediaUrl =
        processedKey || thumbnailKey
          ? await getSignedUrlResponse(
              signingConfig,
              processedKey ?? thumbnailKey
            )
          : undefined;

      return {
        mediaId: String(item.mediaId),
        position: Number(item.position ?? 0),
        type: String(item.type ?? "IMAGE"),
        url: mediaUrl,
        sources:
          playlistKey && hlsUrl
            ? {
                hls: {
                  url: hlsUrl,
                  ...(renditions ? { renditions } : {})
                }
              }
            : undefined,
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0)
      };
    })
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
  mediaCount: Array.isArray(post.media) ? post.media.length : 0,
  createdAt: String(post.createdAt),
  updatedAt: String(post.updatedAt ?? post.createdAt),
  likeCount: Number(post.likeCount ?? 0)
});
