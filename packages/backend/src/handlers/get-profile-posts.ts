import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { getMediaSigningConfig } from "../lib/media-config.js";
import { getSignedProcessedMediaUrl } from "../lib/posts.js";
import { getProfileByUsername } from "../lib/profiles.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");
const mediaSigningConfig = getMediaSigningConfig();

type RawPost = Record<string, unknown>;

type RawMedia = {
  mediaId?: unknown;
  position?: unknown;
  type?: unknown;
  processedKey?: unknown;
  width?: unknown;
  height?: unknown;
};

const toThumbnailResponse = async (media: unknown) => {
  if (!Array.isArray(media) || media.length === 0) {
    return null;
  }

  const thumbnail = [...(media as RawMedia[])].sort(
    (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)
  )[0];

  if (!thumbnail?.processedKey) {
    return null;
  }

  return {
    mediaId: String(thumbnail.mediaId),
    position: Number(thumbnail.position ?? 0),
    type: String(thumbnail.type ?? "IMAGE"),
    processedKey: String(thumbnail.processedKey),
    url: await getSignedProcessedMediaUrl(
      mediaSigningConfig,
      thumbnail.processedKey
    ),
    width: Number(thumbnail.width ?? 0),
    height: Number(thumbnail.height ?? 0)
  };
};

const toPostSummaryResponse = async (post: RawPost) => ({
  postId: String(post.postId),
  profileId: String(post.profileId),
  caption: String(post.caption ?? ""),
  status: String(post.status ?? "READY"),
  thumbnail: await toThumbnailResponse(post.media),
  mediaCount: Array.isArray(post.media) ? post.media.length : 0,
  createdAt: String(post.createdAt),
  likeCount: Number(post.likeCount ?? 0)
});

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

  if (!username) {
    return json(400, {
      code: "USERNAME_REQUIRED",
      message: "Username is required."
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
    new QueryCommand({
      TableName: postsTableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :profileId",
      ExpressionAttributeValues: {
        ":profileId": `PROFILE#${profileId}`
      },
      ProjectionExpression:
        "postId, profileId, caption, #status, #media, createdAt, likeCount",
      ExpressionAttributeNames: {
        "#status": "status",
        "#media": "media"
      },
      ScanIndexForward: false
    })
  );

  return json(200, {
    posts: await Promise.all(result.Items?.map(toPostSummaryResponse) ?? [])
  });
}
