import type { SQSEvent } from "aws-lambda";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { s3Client } from "../lib/s3.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const postsTableName = requireEnv("POSTS_TABLE_NAME");

type PostMedia = {
  mediaId: string;
  position: number;
  type: "IMAGE";
  originalKey: string;
};

type S3Body = {
  transformToByteArray(): Promise<Uint8Array>;
};

const streamToBuffer = async (stream: S3Body) =>
  Buffer.from(await stream.transformToByteArray());

async function processPost(postId: string) {
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

  if (!post || post.status !== "PROCESSING") {
    return;
  }

  try {
    const media = (post.media as PostMedia[]).sort(
      (left, right) => left.position - right.position
    );
    const processedMedia = await Promise.all(
      media.map(async (item) => {
        const original = await s3Client.send(
          new GetObjectCommand({
            Bucket: mediaBucketName,
            Key: item.originalKey
          })
        );
        if (!original.Body) {
          throw new Error(`Original media ${item.originalKey} is empty.`);
        }

        const input = await streamToBuffer(original.Body);
        const processed = await sharp(input)
          .rotate()
          .resize({
            width: 1080,
            withoutEnlargement: true
          })
          .jpeg({ quality: 85 })
          .toBuffer({ resolveWithObject: true });
        const processedKey = `posts/processed/${post.profileId}/${postId}/${item.position}-${item.mediaId}.jpg`;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: mediaBucketName,
            Key: processedKey,
            Body: processed.data,
            ContentType: "image/jpeg"
          })
        );

        return {
          ...item,
          processedKey,
          width: processed.info.width,
          height: processed.info.height
        };
      })
    );

    await documentClient.send(
      new UpdateCommand({
        TableName: postsTableName,
        Key: {
          PK: `POST#${postId}`,
          SK: "METADATA"
        },
        UpdateExpression:
          "SET #media = :media, #status = :ready, updatedAt = :updatedAt, version = if_not_exists(version, :zero) + :one, GSI1PK = :profilePk, GSI1SK = :postSk",
        ConditionExpression: "#status = :processing",
        ExpressionAttributeNames: {
          "#media": "media",
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":media": processedMedia,
          ":processing": "PROCESSING",
          ":ready": "READY",
          ":updatedAt": new Date().toISOString(),
          ":zero": 0,
          ":one": 1,
          ":profilePk": `PROFILE#${String(post.profileId)}`,
          ":postSk": `POST#${String(post.createdAt)}#${postId}`
        }
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return;
    }

    try {
      await documentClient.send(
        new UpdateCommand({
          TableName: postsTableName,
          Key: {
            PK: `POST#${postId}`,
            SK: "METADATA"
          },
          UpdateExpression:
            "SET #status = :failed, failedAt = :updatedAt, failureReason = :failureReason, updatedAt = :updatedAt, version = if_not_exists(version, :zero) + :one",
          ConditionExpression: "#status = :processing",
          ExpressionAttributeNames: {
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":processing": "PROCESSING",
            ":failed": "FAILED",
            ":failureReason":
              error instanceof Error ? error.message : "Image processing failed.",
            ":updatedAt": new Date().toISOString(),
            ":zero": 0,
            ":one": 1
          }
        })
      );
    } catch (updateError) {
      if (
        updateError instanceof Error &&
        updateError.name === "ConditionalCheckFailedException"
      ) {
        return;
      }

      throw updateError;
    }

    throw error;
  }
}

export async function handler(event: SQSEvent) {
  await Promise.all(
    event.Records.map(async (record) => {
      const { postId } = JSON.parse(record.body) as { postId: string };
      await processPost(postId);
    })
  );
}
