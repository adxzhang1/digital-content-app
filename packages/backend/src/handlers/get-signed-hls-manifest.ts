import { GetObjectCommand } from "@aws-sdk/client-s3";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { requireEnv } from "../lib/env.js";
import { defaultSignedUrlTtlSeconds } from "../lib/media-config.js";
import { getSignedCloudFrontUrlWithPolicy } from "../lib/media-signer.js";
import { s3Client } from "../lib/s3.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const mediaSigningKeyPairId = requireEnv("MEDIA_SIGNING_KEY_PAIR_ID");
const mediaSigningKeySecretName = requireEnv("MEDIA_SIGNING_KEY_SECRET_NAME");
const signedParamNames = ["Expires", "Key-Pair-Id", "Policy", "Signature"];

const responseHeaders = {
  "access-control-allow-origin": "*"
};

const json = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    ...responseHeaders,
    "content-type": "application/json"
  },
  body: JSON.stringify(body)
});

const getManifestKey = (rawPath: string) => {
  const key = decodeURIComponent(rawPath.replace(/^\/+/, ""));

  return key.endsWith(".m3u8") ? key : undefined;
};

const getHlsPrefix = (manifestKey: string) =>
  manifestKey.split("/").slice(0, -1).join("/");

const resolveRelativeKey = (baseKey: string, relativePath: string) => {
  const baseParts = baseKey.split("/").slice(0, -1);

  for (const part of relativePath.split("?")[0]?.split("/") ?? []) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      baseParts.pop();
      continue;
    }

    baseParts.push(part);
  }

  return baseParts.join("/");
};

const getMediaUrl = (baseUrl: string, key: string) =>
  `${baseUrl.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;

const getSigningConfig = (mediaBaseUrl: string) => ({
  baseUrl: mediaBaseUrl,
  keyPairId: mediaSigningKeyPairId,
  keySecretName: mediaSigningKeySecretName,
  expiresInSeconds: defaultSignedUrlTtlSeconds
});

const getMediaBaseUrl = (event: APIGatewayProxyEventV2) => {
  const viewerHost = event.headers["x-viewer-host"];

  if (!viewerHost) {
    return undefined;
  }

  return `https://${viewerHost}`;
};

const getS3Text = async (key: string) => {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: mediaBucketName,
      Key: key
    })
  );

  if (!result.Body) {
    throw new Error(`Manifest ${key} is empty.`);
  }

  return result.Body.transformToString();
};

const getSegmentSignedParams = async (
  hlsPrefix: string,
  mediaBaseUrl: string
) => {
  const signedUrl = await getSignedCloudFrontUrlWithPolicy({
    config: getSigningConfig(mediaBaseUrl),
    resourceUrl: `${mediaBaseUrl}/${hlsPrefix}/*.ts`,
    url: getMediaUrl(mediaBaseUrl, `${hlsPrefix}/segment.ts`)
  });
  const signedParams = new URL(signedUrl).searchParams;
  const params = new URLSearchParams();

  for (const name of signedParamNames) {
    const value = signedParams.get(name);

    if (value) {
      params.set(name, value);
    }
  }

  return params;
};

const appendQueryParams = (url: string, params: URLSearchParams) => {
  const queryString = params.toString();

  if (!queryString) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
};

const isManifestLine = (line: string) => line.split("?")[0]?.endsWith(".m3u8");

const getSignedManifestParams = async (
  hlsPrefix: string,
  mediaBaseUrl: string,
  key: string
) => {
  const signedUrl = await getSignedCloudFrontUrlWithPolicy({
    config: getSigningConfig(mediaBaseUrl),
    resourceUrl: `${mediaBaseUrl}/${hlsPrefix}/*.m3u8`,
    url: getMediaUrl(mediaBaseUrl, key)
  });
  const signedParams = new URL(signedUrl).searchParams;
  const params = new URLSearchParams();

  for (const name of signedParamNames) {
    const value = signedParams.get(name);

    if (value) {
      params.set(name, value);
    }
  }

  return params;
};

const rewriteManifest = async ({
  manifest,
  manifestKey,
  mediaBaseUrl,
  segmentSignedParams
}: {
  manifest: string;
  manifestKey: string;
  mediaBaseUrl: string;
  segmentSignedParams: URLSearchParams;
}) => {
  const hlsPrefix = getHlsPrefix(manifestKey);
  const lines = await Promise.all(
    manifest.split(/\r?\n/).map(async (line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        return line;
      }

      if (isManifestLine(trimmedLine)) {
        const childManifestParams = await getSignedManifestParams(
          hlsPrefix,
          mediaBaseUrl,
          resolveRelativeKey(manifestKey, trimmedLine)
        );

        return appendQueryParams(trimmedLine, childManifestParams);
      }

      return appendQueryParams(trimmedLine, segmentSignedParams);
    })
  );

  return lines.join("\n");
};

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const manifestKey = getManifestKey(event.rawPath ?? "");
  const mediaBaseUrl = getMediaBaseUrl(event);

  if (!manifestKey) {
    return json(404, {
      code: "NOT_FOUND",
      message: "Manifest not found."
    });
  }

  if (!mediaBaseUrl) {
    return json(400, {
      code: "MEDIA_BASE_URL_REQUIRED",
      message: "Media base URL is required."
    });
  }

  const manifest = await getS3Text(manifestKey);
  const segmentSignedParams = await getSegmentSignedParams(
    getHlsPrefix(manifestKey),
    mediaBaseUrl
  );

  return {
    statusCode: 200,
    headers: {
      ...responseHeaders,
      "content-type": "application/vnd.apple.mpegurl"
    },
    body: await rewriteManifest({
      manifest,
      manifestKey,
      mediaBaseUrl,
      segmentSignedParams
    })
  };
}
