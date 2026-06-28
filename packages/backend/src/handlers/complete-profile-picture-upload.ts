import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json, parseJsonBody } from "../lib/http.js";
import { sqsClient } from "../lib/sqs.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");
const profilePictureProcessingQueueUrl = requireEnv(
  "PROFILE_PICTURE_PROCESSING_QUEUE_URL"
);

const completeProfilePictureSchema = z.object({
  imageId: z.string().trim().min(1, "Image id is required.")
});

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

  const parsedBody = completeProfilePictureSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_PROFILE_PICTURE",
      message:
        parsedBody.error.issues[0]?.message ?? "Invalid profile picture payload."
    });
  }

  const { imageId } = parsedBody.data;
  const updatedAt = new Date().toISOString();
  let profilePicture;

  try {
    const result = await documentClient.send(
      new UpdateCommand({
        TableName: profilesTableName,
        Key: {
          PK: `PROFILE_IMAGE#${imageId}`,
          SK: "METADATA"
        },
        ConditionExpression:
          "profileId = :profileId AND #status = :uploading",
        UpdateExpression: "SET #status = :processing, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":profileId": authenticatedUser.profileId,
          ":uploading": "UPLOADING",
          ":processing": "PROCESSING",
          ":updatedAt": updatedAt
        },
        ReturnValues: "ALL_NEW"
      })
    );

    profilePicture = result.Attributes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return json(404, {
        code: "PROFILE_PICTURE_NOT_FOUND",
        message: "Profile picture not found."
      });
    }

    throw error;
  }

  if (!profilePicture) {
    return json(404, {
      code: "PROFILE_PICTURE_NOT_FOUND",
      message: "Profile picture not found."
    });
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: profilePictureProcessingQueueUrl,
      MessageBody: JSON.stringify({
        profileId: authenticatedUser.profileId,
        imageId
      })
    })
  );

  return json(202, {
    profilePicture
  });
}
