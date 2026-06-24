import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { getProfileByUsername } from "../lib/profiles.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

const formatCount = (value: number) => new Intl.NumberFormat("en").format(value);

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

  try {
    const result = await documentClient.send(
      new UpdateCommand({
        TableName: postsTableName,
        Key: {
          PK: `POST#${postId}`,
          SK: "METADATA"
        },
        UpdateExpression: "ADD likeCount :increment",
        ConditionExpression:
          "attribute_exists(PK) AND profileId = :profileId AND #status = :ready",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":increment": 1,
          ":profileId": profileId,
          ":ready": "READY"
        },
        ReturnValues: "UPDATED_NEW"
      })
    );

    const likeCount = Number(result.Attributes?.likeCount ?? 0);

    return json(200, {
      postId,
      likes: formatCount(likeCount)
    });
  } catch {
    return json(404, {
      code: "POST_NOT_FOUND",
      message: "Post not found."
    });
  }
}
