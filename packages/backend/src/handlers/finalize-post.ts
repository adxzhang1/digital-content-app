import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import {
  authErrorResponse,
  requireOnboardedUser,
  userOwnsProfile
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { getMediaSigningConfig } from "../lib/media-config.js";
import { sqsClient } from "../lib/sqs.js";
import { json, parseJsonBody } from "../lib/http.js";
import { toPostResponse } from "../lib/posts.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");
const postProcessingQueueUrl = requireEnv("POST_PROCESSING_QUEUE_URL");

const imageMediaSchema = z.object({
  mediaId: z.string().trim().min(1, "Media id is required."),
  position: z.number().int().min(0).max(9),
  type: z.literal("IMAGE"),
  originalKey: z.string().trim().min(1, "Original key is required."),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"])
});

const videoMediaSchema = z.object({
  mediaId: z.string().trim().min(1, "Media id is required."),
  position: z.literal(0),
  type: z.literal("VIDEO"),
  originalKey: z.string().trim().min(1, "Original key is required."),
  contentType: z.enum(["video/mp4", "video/quicktime", "video/webm"])
});

const mediaSchema = z.union([imageMediaSchema, videoMediaSchema]);

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
} as const;

const getExpectedOriginalKey = ({
  mediaId,
  position,
  postId,
  profileId,
  contentType
}: {
  mediaId: string;
  position: number;
  postId: string;
  profileId: string;
  contentType: keyof typeof extensionByContentType;
}) =>
  `posts/original/${profileId}/${postId}/${position}-${mediaId}.${
    extensionByContentType[contentType]
  }`;

const finalizePostSchema = z
  .object({
    postId: z.string().trim().min(1, "Post id is required."),
    profileId: z.string().trim().min(1, "Profile id is required."),
    caption: z.string().trim().max(2200).default(""),
    media: z.array(mediaSchema).min(1).max(10)
  })
  .superRefine((value, context) => {
    const hasVideo = value.media.some((item) => item.type === "VIDEO");

    if (hasVideo && value.media.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "A video must be the only media item in a post."
      });
    }

    value.media.forEach((item, index) => {
      const expectedOriginalKey = getExpectedOriginalKey({
        contentType: item.contentType,
        mediaId: item.mediaId,
        position: item.position,
        postId: value.postId,
        profileId: value.profileId
      });

      if (item.position !== index || item.originalKey !== expectedOriginalKey) {
        context.addIssue({
          code: "custom",
          message: "Invalid media item."
        });
      }
    });
  });

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

  const parsedBody = finalizePostSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_POST",
      message: parsedBody.error.issues[0]?.message ?? "Invalid post payload."
    });
  }

  const { postId, profileId, caption, media } = parsedBody.data;
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
      message: "Only the profile owner can finalize posts."
    });
  }

  const createdAt = new Date().toISOString();
  const post = {
    postId,
    profileId,
    caption,
    status: "PROCESSING",
    media: media.map((item) => ({
      mediaId: item.mediaId,
      position: item.position,
      type: item.type,
      originalKey: item.originalKey
    })),
    createdAt,
    updatedAt: createdAt,
    likeCount: 0
  };

  try {
    await documentClient.send(
      new PutCommand({
        TableName: postsTableName,
        Item: {
          PK: `POST#${postId}`,
          SK: "METADATA",
          ...post,
          version: 1
        },
        ConditionExpression: "attribute_not_exists(PK)"
      })
    );

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: postProcessingQueueUrl,
        MessageBody: JSON.stringify({
          postId
        })
      })
    );
  } catch {
    return json(500, {
      code: "POST_FINALIZE_FAILED",
      message: "Could not finalize post."
    });
  }

  return json(201, {
    post: await toPostResponse(post, getMediaSigningConfig())
  });
}
