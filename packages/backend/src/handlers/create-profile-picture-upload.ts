import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

const uploadUrlSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"])
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

  const parsedBody = uploadUrlSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_UPLOAD_REQUEST",
      message:
        parsedBody.error.issues[0]?.message ?? "Invalid upload URL payload."
    });
  }

  const { contentType } = parsedBody.data;
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

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: mediaBucketName,
      Key: originalKey,
      ContentType: contentType
    }),
    {
      expiresIn: 900
    }
  );

  return json(200, {
    profilePicture,
    uploadUrl
  });
}
