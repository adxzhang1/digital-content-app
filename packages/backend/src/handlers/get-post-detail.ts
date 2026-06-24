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
import { getMediaSigningConfig } from "../lib/media-config.js";
import { toPostResponse } from "../lib/posts.js";
import { getProfileByUsername } from "../lib/profiles.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    requireOnboardedUser(event);
  } catch (error) {
    const response = authErrorResponse(error);

    if (response) {
      return response;
    }

    throw error;
  }

  const username = event.pathParameters?.username?.trim().toLowerCase();
  const postId = event.pathParameters?.postId;

  if (!username) {
    return json(400, {
      code: "USERNAME_REQUIRED",
      message: "Username is required."
    });
  }

  if (!postId) {
    return json(400, {
      code: "POST_ID_REQUIRED",
      message: "Post id is required."
    });
  }

  const profile = await getProfileByUsername(profilesTableName, username);

  if (!profile) {
    return json(404, {
      code: "PROFILE_NOT_FOUND",
      message: "Profile not found."
    });
  }

  const profileId = String(profile.profileId);

  const result = await documentClient.send(
    new GetCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      }
    })
  );

  const post = result.Item;

  if (!post) {
    return json(404, {
      code: "POST_NOT_FOUND",
      message: "Post not found."
    });
  }

  if (post.profileId !== profileId || post.status !== "READY") {
    return json(404, {
      code: "POST_NOT_FOUND",
      message: "Post not found."
    });
  }

  return json(200, {
    post: await toPostResponse(post, getMediaSigningConfig())
  });
}
