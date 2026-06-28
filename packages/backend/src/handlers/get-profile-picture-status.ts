import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

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

  const imageId = event.pathParameters?.imageId;

  if (!imageId) {
    return json(400, {
      code: "PROFILE_PICTURE_ID_REQUIRED",
      message: "Profile picture id is required."
    });
  }

  const result = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `PROFILE_IMAGE#${imageId}`,
        SK: "METADATA"
      }
    })
  );
  const image = result.Item;

  if (!image || image.profileId !== authenticatedUser.profileId) {
    return json(404, {
      code: "PROFILE_PICTURE_NOT_FOUND",
      message: "Profile picture not found."
    });
  }

  return json(200, {
    profilePicture: {
      imageId: String(image.imageId),
      profileId: String(image.profileId),
      status: String(image.status),
      width: Number(image.width ?? 0),
      height: Number(image.height ?? 0),
      createdAt: String(image.createdAt ?? ""),
      updatedAt: String(image.updatedAt ?? "")
    }
  });
}
