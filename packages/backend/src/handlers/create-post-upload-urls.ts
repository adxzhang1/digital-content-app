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

const imageSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"])
});

const uploadUrlsSchema = z.object({
  profileId: z.string().trim().min(1, "Profile id is required."),
  images: z.array(imageSchema).min(1).max(10)
});

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
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

  const { profileId, images } = parsedBody.data;
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
    images.map(async (image, position) => {
      const mediaId = `m_${uuidv7()}`;
      const originalKey = `posts/original/${profileId}/${postId}/${position}-${mediaId}.${
        extensionByContentType[image.contentType]
      }`;
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: mediaBucketName,
          Key: originalKey,
          ContentType: image.contentType
        }),
        {
          expiresIn: 900
        }
      );

      return {
        mediaId,
        position,
        type: "IMAGE",
        contentType: image.contentType,
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
