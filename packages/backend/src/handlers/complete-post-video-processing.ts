import type { EventBridgeEvent } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";

const postsTableName = requireEnv("POSTS_TABLE_NAME");

type MediaConvertJobDetail = {
  status?: string;
  jobId?: string;
  userMetadata?: {
    postId?: string;
  };
  errorMessage?: string;
};

const getPostId = (detail: MediaConvertJobDetail) => detail.userMetadata?.postId;

async function getPost(postId: string) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      }
    })
  );

  return result.Item;
}

async function markPostReady(postId: string) {
  const post = await getPost(postId);

  if (!post) {
    return;
  }

  const now = new Date().toISOString();

  await documentClient.send(
    new UpdateCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      },
      UpdateExpression:
        "SET #status = :ready, updatedAt = :now, version = if_not_exists(version, :zero) + :one, GSI1PK = :profilePk, GSI1SK = :postSk",
      ConditionExpression: "#status = :processing",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":processing": "PROCESSING",
        ":ready": "READY",
        ":now": now,
        ":zero": 0,
        ":one": 1,
        ":profilePk": `PROFILE#${String(post.profileId)}`,
        ":postSk": `POST#${String(post.createdAt)}#${postId}`
      }
    })
  );
}

async function markPostFailed({
  failureReason,
  postId
}: {
  failureReason: string;
  postId: string;
}) {
  const now = new Date().toISOString();

  await documentClient.send(
    new UpdateCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      },
      UpdateExpression:
        "SET #status = :failed, failedAt = :now, failureReason = :failureReason, updatedAt = :now, version = if_not_exists(version, :zero) + :one",
      ConditionExpression: "#status = :processing",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":processing": "PROCESSING",
        ":failed": "FAILED",
        ":failureReason": failureReason,
        ":now": now,
        ":zero": 0,
        ":one": 1
      }
    })
  );
}

export async function handler(
  event: EventBridgeEvent<"MediaConvert Job State Change", MediaConvertJobDetail>
) {
  const postId = getPostId(event.detail);

  if (!postId) {
    return;
  }

  try {
    if (event.detail.status === "COMPLETE") {
      await markPostReady(postId);
      return;
    }

    if (event.detail.status === "ERROR") {
      await markPostFailed({
        failureReason: event.detail.errorMessage ?? "Video processing failed.",
        postId
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return;
    }

    throw error;
  }
}
