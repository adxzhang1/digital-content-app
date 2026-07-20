import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json, parseJsonBody } from "../lib/http.js";
import { s3Client } from "../lib/s3.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

const uploadSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive()
});

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
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

  let body: unknown;

  try {
    body = parseJsonBody(event);
  } catch {
    return json(400, {
      code: "INVALID_JSON",
      message: "Request body must be valid JSON."
    });
  }

  const parsedBody = uploadSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_UPLOAD_REQUEST",
      message:
        parsedBody.error.issues[0]?.message ?? "Invalid upload payload."
    });
  }

  const { contentType, sizeBytes } = parsedBody.data;
  const imageId = `img_${uuidv7()}`;
  const originalKey = `profiles/original/${authenticatedUser.profileId}/${imageId}.${
    extensionByContentType[contentType]
  }`;
  const createdAt = new Date().toISOString();
  const profilePicture = {
    imageId,
    profileId: authenticatedUser.profileId,
    status: "UPLOADING",
    originalKey,
    contentType,
    createdAt,
    updatedAt: createdAt
  };

  try {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: profilesTableName,
              Item: {
                PK: `PROFILE_IMAGE#${imageId}`,
                SK: "METADATA",
                ...profilePicture
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          {
            ConditionCheck: {
              TableName: profilesTableName,
              Key: {
                PK: `PROFILE#${authenticatedUser.profileId}`,
                SK: "METADATA"
              },
              ConditionExpression: "attribute_exists(PK)"
            }
          }
        ]
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "TransactionCanceledException"
    ) {
      return json(404, {
        code: "PROFILE_NOT_FOUND",
        message: "Profile not found."
      });
    }

    throw error;
  }

  const upload = await createPresignedPost(
    s3Client,
    {
      Bucket: mediaBucketName,
      Key: originalKey,
      Conditions: [
        ["content-length-range", 1, sizeBytes],
        ["eq", "$Content-Type", contentType]
      ],
      Fields: {
        "Content-Type": contentType
      },
      Expires: 900
    }
  );

  return json(200, {
    profilePicture,
    upload
  });
}
