import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import {
  authErrorResponse,
  requireOnboardedUser,
  userOwnsProfile
} from "../lib/auth.js";
import { requireEnv } from "../lib/env.js";
import { s3Client } from "../lib/s3.js";
import { json, parseJsonBody } from "../lib/http.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const maxVideoBytes = 50 * 1024 * 1024;

const imageContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const videoContentTypeSchema = z.enum([
  "video/mp4",
  "video/quicktime",
  "video/webm"
]);

const mediaSchema = z.object({
  contentType: z.union([imageContentTypeSchema, videoContentTypeSchema]),
  sizeBytes: z.number().int().positive().optional()
});

const uploadUrlsSchema = z
  .object({
    profileId: z.string().trim().min(1, "Profile id is required."),
    media: z.array(mediaSchema).min(1).max(10)
  })
  .superRefine((value, context) => {
    const videoItems = value.media.filter((item) =>
      videoContentTypeSchema.safeParse(item.contentType).success
    );

    if (videoItems.length > 0 && value.media.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "A video must be the only media item in a post."
      });
    }

    const videoItem = videoItems[0];

    if (
      videoItem &&
      (!videoItem.sizeBytes || videoItem.sizeBytes > maxVideoBytes)
    ) {
      context.addIssue({
        code: "custom",
        message: "Video must be 50 MB or smaller."
      });
    }
  });

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
} as const;

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: unknown;

  try {
    body = parseJsonBody(event);
  } catch {
    return json(400, {
      code: "INVALID_JSON",
      message: "Request body must be valid JSON."
    });
  }

  const parsedBody = uploadUrlsSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_UPLOAD_REQUEST",
      message:
        parsedBody.error.issues[0]?.message ?? "Invalid upload URL payload."
    });
  }

  const { profileId, media: mediaItems } = parsedBody.data;
  let authenticatedUser;

  try {
    authenticatedUser = requireOnboardedUser(event);
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }

  if (!userOwnsProfile(authenticatedUser, profileId)) {
    return json(403, {
      code: "PROFILE_ACCESS_DENIED",
      message: "Only the profile owner can create upload URLs."
    });
  }

  const postId = `post_${uuidv7()}`;
  const media = await Promise.all(
    mediaItems.map(async (item, position) => {
      const mediaId = `m_${uuidv7()}`;
      const originalKey = `posts/original/${profileId}/${postId}/${position}-${mediaId}.${
        extensionByContentType[item.contentType]
      }`;
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: mediaBucketName,
          Key: originalKey,
          ContentType: item.contentType
        }),
        {
          expiresIn: 900
        }
      );

      return {
        mediaId,
        position,
        type: videoContentTypeSchema.safeParse(item.contentType).success
          ? "VIDEO"
          : "IMAGE",
        contentType: item.contentType,
        originalKey,
        uploadUrl
      };
    })
  );

  return json(200, {
    postId,
    media
  });
}
