import type { SQSEvent } from "aws-lambda";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import {
  DeleteCommand,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { s3Client } from "../lib/s3.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

type ProfilePicture = {
  imageId: string;
  profileId: string;
  status: "PROCESSING" | "READY" | "FAILED";
  originalKey: string;
  contentType: string;
  processedKey?: string;
};

type S3Body = {
  transformToByteArray(): Promise<Uint8Array>;
};

const streamToBuffer = async (stream: S3Body) =>
  Buffer.from(await stream.transformToByteArray());

const getProfilePictureKeys = (image: unknown) => {
  if (!image || typeof image !== "object") {
    return [];
  }

  const profilePicture = image as Partial<ProfilePicture>;

  return [
    ...new Set([profilePicture.originalKey, profilePicture.processedKey].filter(
      (key): key is string => typeof key === "string" && key.length > 0
    ))
  ];
};

async function deletePreviousProfilePicture(previousImageId: unknown) {
  if (typeof previousImageId !== "string" || previousImageId.length === 0) {
    return;
  }

  try {
    const result = await documentClient.send(
      new GetCommand({
        TableName: profilesTableName,
        Key: {
          PK: `PROFILE_IMAGE#${previousImageId}`,
          SK: "METADATA"
        }
      })
    );
    const keys = getProfilePictureKeys(result.Item);

    if (keys.length === 0) {
      return;
    }

    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: mediaBucketName,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
          Quiet: true
        }
      })
    );

    await documentClient.send(
      new DeleteCommand({
        TableName: profilesTableName,
        Key: {
          PK: `PROFILE_IMAGE#${previousImageId}`,
          SK: "METADATA"
        }
      })
    );
  } catch (error) {
    console.warn("Failed to delete previous profile picture.", {
      error,
      previousImageId
    });
  }
}

async function processProfilePicture(profileId: string, imageId: string) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `PROFILE_IMAGE#${imageId}`,
        SK: "METADATA"
      }
    })
  );
  const image = result.Item as ProfilePicture | undefined;

  if (
    !image ||
    image.profileId !== profileId ||
    image.status !== "PROCESSING"
  ) {
    return;
  }

  try {
    const original = await s3Client.send(
      new GetObjectCommand({
        Bucket: mediaBucketName,
        Key: image.originalKey
      })
    );

    if (!original.Body) {
      throw new Error(`Original profile picture ${image.originalKey} is empty.`);
    }

    const input = await streamToBuffer(original.Body);
    const processed = await sharp(input)
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "cover"
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const processedKey = `profiles/processed/${profileId}/${imageId}.jpg`;
    const updatedAt = new Date().toISOString();
    const profilePicture = {
      imageId,
      processedKey,
      width: processed.info.width,
      height: processed.info.height
    };

    await s3Client.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: processedKey,
        Body: processed.data,
        ContentType: "image/jpeg"
      })
    );

    const profileResult = await documentClient.send(
      new GetCommand({
        TableName: profilesTableName,
        Key: {
          PK: `PROFILE#${profileId}`,
          SK: "METADATA"
        }
      })
    );
    const previousImageId = profileResult.Item?.imageId;

    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: profilesTableName,
                Key: {
                  PK: `PROFILE_IMAGE#${imageId}`,
                  SK: "METADATA"
                },
                ConditionExpression: "#status = :processing",
                UpdateExpression:
                  [
                    "SET #status = :ready,",
                    "processedKey = :processedKey,",
                    "width = :width,",
                    "height = :height,",
                    "updatedAt = :updatedAt"
                  ].join(" "),
                ExpressionAttributeNames: {
                  "#status": "status"
                },
                ExpressionAttributeValues: {
                  ":processing": "PROCESSING",
                  ":ready": "READY",
                  ":processedKey": processedKey,
                  ":width": processed.info.width,
                  ":height": processed.info.height,
                  ":updatedAt": updatedAt
                }
              }
            },
            {
              Update: {
                TableName: profilesTableName,
                Key: {
                  PK: `PROFILE#${profileId}`,
                  SK: "METADATA"
                },
                ConditionExpression: "attribute_exists(PK)",
                UpdateExpression:
                  "SET imageId = :imageId, #image = :image, updatedAt = :updatedAt",
                ExpressionAttributeNames: {
                  "#image": "image"
                },
                ExpressionAttributeValues: {
                  ":imageId": imageId,
                  ":image": profilePicture,
                  ":updatedAt": updatedAt
                }
              }
            }
          ]
        })
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "TransactionCanceledException"
      ) {
        return;
      }

      throw error;
    }

    if (previousImageId !== imageId) {
      await deletePreviousProfilePicture(previousImageId);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return;
    }

    const updatedAt = new Date().toISOString();

    try {
      await documentClient.send(
        new UpdateCommand({
          TableName: profilesTableName,
          Key: {
            PK: `PROFILE_IMAGE#${imageId}`,
            SK: "METADATA"
          },
          ConditionExpression: "#status = :processing",
          UpdateExpression:
            [
              "SET #status = :failed,",
              "failedAt = :updatedAt,",
              "failureReason = :failureReason,",
              "updatedAt = :updatedAt"
            ].join(" "),
          ExpressionAttributeNames: {
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":processing": "PROCESSING",
            ":failed": "FAILED",
            ":failureReason":
              error instanceof Error ? error.message : "Image processing failed.",
            ":updatedAt": updatedAt
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
      const { profileId, imageId } = JSON.parse(record.body) as {
        profileId: string;
        imageId: string;
      };
      await processProfilePicture(profileId, imageId);
    })
  );
}
