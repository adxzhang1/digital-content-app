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

const postsTableName = requireEnv("POSTS_TABLE_NAME");

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

  const postId = event.pathParameters?.postId;

  if (!postId) {
    return json(400, {
      code: "POST_ID_REQUIRED",
      message: "Post id is required."
    });
  }

  const result = await documentClient.send(
    new GetCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      }
    })
  );

  if (!result.Item || result.Item.profileId !== authenticatedUser.profileId) {
    return json(404, {
      code: "POST_NOT_FOUND",
      message: "Post not found."
    });
  }

  return json(200, {
    post: {
      postId: result.Item.postId,
      profileId: result.Item.profileId,
      status: result.Item.status,
      media: result.Item.media ?? [],
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt
    }
  });
}
