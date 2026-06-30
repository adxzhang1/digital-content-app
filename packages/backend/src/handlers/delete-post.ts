import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { CancelJobCommand } from "@aws-sdk/client-mediaconvert";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  authErrorResponse,
  requireOnboardedUser,
  userOwnsProfile
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { mediaConvertClient } from "../lib/mediaconvert.js";
import { getProfileByUsername } from "../lib/profiles.js";
import { s3Client } from "../lib/s3.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");
const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");

type PostMedia = {
  hlsPrefix?: unknown;
  originalKey?: unknown;
  playlistKey?: unknown;
  processedKey?: unknown;
  thumbnailKey?: unknown;
};

type DeleteMode = "soft" | "force";

const getPostMediaKeys = (media: unknown) => {
  if (!Array.isArray(media)) {
    return [];
  }

  return [
    ...new Set(
      (media as PostMedia[])
        .flatMap((item) => [
          item.originalKey,
          item.processedKey,
          item.playlistKey,
          item.thumbnailKey,
        ])
        .filter((key): key is string => typeof key === "string" && key.length > 0)
    )
  ];
};

const getPostMediaPrefixes = (media: unknown) => {
  if (!Array.isArray(media)) {
    return [];
  }

  return [
    ...new Set(
      (media as PostMedia[])
        .map((item) => item.hlsPrefix)
        .filter(
          (prefix): prefix is string =>
            typeof prefix === "string" && prefix.length > 0
        )
    )
  ];
};

const getDeleteMode = (event: APIGatewayProxyEventV2): DeleteMode =>
  event.queryStringParameters?.deleteMode === "force" ||
  event.queryStringParameters?.forceDelete === "true"
    ? "force"
    : "soft";

async function deleteMediaObjects(media: unknown) {
  const mediaKeys = new Set(getPostMediaKeys(media));
  const prefixes = getPostMediaPrefixes(media);

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;

    do {
      const result = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: mediaBucketName,
          ContinuationToken: continuationToken,
          Prefix: prefix
        })
      );

      result.Contents?.forEach((object) => {
        if (object.Key) {
          mediaKeys.add(object.Key);
        }
      });

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
  }

  if (mediaKeys.size === 0) {
    return;
  }

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: mediaBucketName,
      Delete: {
        Objects: [...mediaKeys].map((key) => ({
          Key: key
        })),
        Quiet: true
      }
    })
  );
}

async function cancelMediaConvertJob(jobId: unknown) {
  if (typeof jobId !== "string" || jobId.length === 0) {
    return;
  }

  try {
    await mediaConvertClient.send(
      new CancelJobCommand({
        Id: jobId
      })
    );
  } catch {
    // The job may already be complete; force delete should still remove records.
  }
}

async function forceDeletePost({
  media,
  mediaConvertJobId,
  postId,
  profileId
}: {
  media: unknown;
  mediaConvertJobId: unknown;
  postId: string;
  profileId: string;
}) {
  await cancelMediaConvertJob(mediaConvertJobId);
  await deleteMediaObjects(media);

  await documentClient.send(
    new DeleteCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      },
      ConditionExpression: "profileId = :profileId",
      ExpressionAttributeValues: {
        ":profileId": profileId
      }
    })
  );
}

async function softDeletePost(postId: string, profileId: string) {
  const now = new Date().toISOString();

  await documentClient.send(
    new UpdateCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      },
      ConditionExpression: "profileId = :profileId AND #status <> :deleted",
      UpdateExpression:
        "SET #status = :deleted, deletedAt = :now, updatedAt = :now, version = if_not_exists(version, :zero) + :one REMOVE GSI1PK, GSI1SK",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":profileId": profileId,
        ":deleted": "DELETED",
        ":now": now,
        ":zero": 0,
        ":one": 1
      }
    })
  );
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
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
      code: "POST_DELETE_DENIED",
      message: "Only the profile owner can delete posts."
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

  const post = result.Item;

  if (!post || post.profileId !== profileId) {
    return json(404, {
      code: "POST_NOT_FOUND",
      message: "Post not found."
    });
  }

  try {
    const deleteMode = getDeleteMode(event);

    if (deleteMode === "force") {
      await forceDeletePost({
        media: post.media,
        mediaConvertJobId: post.mediaConvertJobId,
        postId,
        profileId
      });
    } else {
      await softDeletePost(postId, profileId);
    }

    return json(200, {
      postId,
      deleteMode
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return json(404, {
        code: "POST_NOT_FOUND",
        message: "Post not found."
      });
    }

    throw error;
  }
}
