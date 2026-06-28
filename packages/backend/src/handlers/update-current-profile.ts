import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json, parseJsonBody } from "../lib/http.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(80),
  bio: z.string().trim().max(160)
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

  const parsedBody = updateProfileSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_PROFILE",
      message: parsedBody.error.issues[0]?.message ?? "Invalid profile payload."
    });
  }

  const { displayName, bio } = parsedBody.data;
  const updatedAt = new Date().toISOString();
  let result;

  try {
    result = await documentClient.send(
      new UpdateCommand({
        TableName: profilesTableName,
        Key: {
          PK: `PROFILE#${authenticatedUser.profileId}`,
          SK: "METADATA"
        },
        ConditionExpression: "attribute_exists(PK)",
        UpdateExpression:
          "SET displayName = :displayName, bio = :bio, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":displayName": displayName,
          ":bio": bio,
          ":updatedAt": updatedAt
        },
        ReturnValues: "ALL_NEW"
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return json(404, {
        code: "PROFILE_NOT_FOUND",
        message: "Profile not found."
      });
    }

    throw error;
  }

  const profile = result.Attributes;

  if (!profile) {
    return json(404, {
      code: "PROFILE_NOT_FOUND",
      message: "Profile not found."
    });
  }

  return json(200, {
    profile: {
      profileId: String(profile.profileId),
      userId: String(profile.userId),
      username: String(profile.username),
      displayName: String(profile.displayName),
      bio: String(profile.bio),
      counts: profile.counts as Record<string, unknown>
    }
  });
}
