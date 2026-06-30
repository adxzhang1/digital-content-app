import type { SQSEvent } from "aws-lambda";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  AudioCodec,
  AudioDefaultSelection,
  ContainerType,
  CreateJobCommand,
  H264CodecProfile,
  H264FramerateControl,
  H264GopSizeUnits,
  H264QualityTuningLevel,
  H264RateControlMode,
  HlsSegmentLengthControl,
  InputTimecodeSource,
  OutputGroupType,
  ProbeCommand,
  TrackType,
  TimecodeSource,
  VideoCodec,
  type Output
} from "@aws-sdk/client-mediaconvert";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { mediaConvertClient } from "../lib/mediaconvert.js";
import { s3Client } from "../lib/s3.js";

const mediaBucketName = requireEnv("MEDIA_BUCKET_NAME");
const postsTableName = requireEnv("POSTS_TABLE_NAME");
const mediaConvertRoleArn = requireEnv("MEDIACONVERT_ROLE_ARN");

type ImagePostMedia = {
  mediaId: string;
  position: number;
  type: "IMAGE";
  originalKey: string;
};

type VideoPostMedia = {
  mediaId: string;
  position: number;
  type: "VIDEO";
  originalKey: string;
};

type PostMedia = ImagePostMedia | VideoPostMedia;

type S3Body = {
  transformToByteArray(): Promise<Uint8Array>;
};

const streamToBuffer = async (stream: S3Body) =>
  Buffer.from(await stream.transformToByteArray());

const getS3Url = (key: string) => `s3://${mediaBucketName}/${key}`;

const getVideoDimensions = async (originalKey: string) => {
  const result = await mediaConvertClient.send(
    new ProbeCommand({
      InputFiles: [
        {
          FileUrl: getS3Url(originalKey)
        }
      ]
    })
  );
  const videoTrack = result.ProbeResults?.[0]?.Container?.Tracks?.find(
    (track) => track.TrackType === TrackType.video
  )?.VideoProperties;

  if (!videoTrack?.Width || !videoTrack.Height) {
    throw new Error("Could not determine video dimensions.");
  }

  return {
    width: videoTrack.Width,
    height: videoTrack.Height
  };
};

const getScaledDimensions = ({
  sourceHeight,
  sourceWidth,
  targetLongEdge
}: {
  sourceHeight: number;
  sourceWidth: number;
  targetLongEdge: number;
}) => {
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, targetLongEdge / sourceLongEdge);
  const width = Math.max(2, Math.floor((sourceWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.floor((sourceHeight * scale) / 2) * 2);
  const size =
    sourceWidth >= sourceHeight ? { Width: width } : { Height: height };

  return {
    size
  };
};

const createVideoOutput = ({
  bitrate,
  size,
  nameModifier
}: {
  bitrate: number;
  size: {
    Height?: number;
    Width?: number;
  };
  nameModifier: string;
}): Output => ({
  NameModifier: nameModifier,
  ContainerSettings: {
    Container: ContainerType.M3U8
  },
  VideoDescription: {
    ...size,
    CodecSettings: {
      Codec: VideoCodec.H_264,
      H264Settings: {
        CodecProfile: H264CodecProfile.HIGH,
        FramerateControl: H264FramerateControl.INITIALIZE_FROM_SOURCE,
        GopSize: 2,
        GopSizeUnits: H264GopSizeUnits.SECONDS,
        MaxBitrate: bitrate,
        QualityTuningLevel: H264QualityTuningLevel.SINGLE_PASS_HQ,
        QvbrSettings: {
          QvbrQualityLevel: 8
        },
        RateControlMode: H264RateControlMode.QVBR
      }
    }
  },
  AudioDescriptions: [
    {
      AudioSourceName: "Audio Selector 1",
      CodecSettings: {
        Codec: AudioCodec.AAC,
        AacSettings: {
          Bitrate: 128_000,
          CodingMode: "CODING_MODE_2_0",
          SampleRate: 48_000
        }
      }
    }
  ],
  OutputSettings: {
    HlsSettings: {}
  }
});

const createThumbnailOutput = (): Output => ({
  ContainerSettings: {
    Container: ContainerType.RAW
  },
  VideoDescription: {
    CodecSettings: {
      Codec: VideoCodec.FRAME_CAPTURE,
      FrameCaptureSettings: {
        FramerateDenominator: 1,
        FramerateNumerator: 1,
        MaxCaptures: 1,
        Quality: 85
      }
    }
  },
  Extension: "jpg"
});

async function submitVideoJob(
  post: Record<string, unknown>,
  item: VideoPostMedia
) {
  const postId = String(post.postId);
  const profileId = String(post.profileId);
  const sourceDimensions = await getVideoDimensions(item.originalKey);
  const rendition720 = getScaledDimensions({
    sourceHeight: sourceDimensions.height,
    sourceWidth: sourceDimensions.width,
    targetLongEdge: 720
  });
  const rendition480 = getScaledDimensions({
    sourceHeight: sourceDimensions.height,
    sourceWidth: sourceDimensions.width,
    targetLongEdge: 480
  });
  const outputPrefix = `posts/processed/${profileId}/${postId}/${item.position}-${item.mediaId}`;
  const hlsBaseKey = `${outputPrefix}/hls`;
  const hlsPlaylistKey = `${hlsBaseKey}/master.m3u8`;
  const thumbnailBaseKey = `${outputPrefix}/thumbnail`;
  const updatedMedia = [
    {
      ...item,
      width: sourceDimensions.width,
      height: sourceDimensions.height,
      hlsPrefix: hlsBaseKey,
      playlistKey: hlsPlaylistKey,
      renditions: {
        "720": rendition720.size,
        "480": rendition480.size
      },
      thumbnailKey: `${thumbnailBaseKey}.0000000.jpg`
    }
  ];
  await documentClient.send(
    new UpdateCommand({
      TableName: postsTableName,
      Key: {
        PK: `POST#${postId}`,
        SK: "METADATA"
      },
      UpdateExpression:
        "SET #media = :media, updatedAt = :updatedAt, version = if_not_exists(version, :zero) + :one",
      ConditionExpression: "#status = :processing",
      ExpressionAttributeNames: {
        "#media": "media",
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":media": updatedMedia,
        ":processing": "PROCESSING",
        ":updatedAt": new Date().toISOString(),
        ":zero": 0,
        ":one": 1
      }
    })
  );

  const job = await mediaConvertClient.send(
    new CreateJobCommand({
      ClientRequestToken: postId,
      Role: mediaConvertRoleArn,
      UserMetadata: {
        postId
      },
      Settings: {
        TimecodeConfig: {
          Source: TimecodeSource.ZEROBASED
        },
        Inputs: [
          {
            AudioSelectors: {
              "Audio Selector 1": {
                DefaultSelection: AudioDefaultSelection.DEFAULT
              }
            },
            FileInput: getS3Url(item.originalKey),
            TimecodeSource: InputTimecodeSource.ZEROBASED
          }
        ],
        OutputGroups: [
          {
            Name: "Post video HLS",
            OutputGroupSettings: {
              Type: OutputGroupType.HLS_GROUP_SETTINGS,
              HlsGroupSettings: {
                Destination: getS3Url(`${hlsBaseKey}/master`),
                MinSegmentLength: 0,
                SegmentLength: 4,
                SegmentLengthControl: HlsSegmentLengthControl.EXACT
              }
            },
            Outputs: [
              createVideoOutput({
                ...rendition720,
                bitrate: 2_000_000,
                nameModifier: "-720"
              }),
              createVideoOutput({
                ...rendition480,
                bitrate: 1_200_000,
                nameModifier: "-480"
              })
            ]
          },
          {
            Name: "Post video thumbnail",
            OutputGroupSettings: {
              Type: OutputGroupType.FILE_GROUP_SETTINGS,
              FileGroupSettings: {
                Destination: getS3Url(thumbnailBaseKey)
              }
            },
            Outputs: [createThumbnailOutput()]
          }
        ]
      }
    })
  );

  if (job.Job?.Id) {
    await documentClient.send(
      new UpdateCommand({
        TableName: postsTableName,
        Key: {
          PK: `POST#${postId}`,
          SK: "METADATA"
        },
        UpdateExpression:
          "SET mediaConvertJobId = :jobId, updatedAt = :updatedAt, version = if_not_exists(version, :zero) + :one",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":jobId": job.Job.Id,
          ":updatedAt": new Date().toISOString(),
          ":zero": 0,
          ":one": 1
        }
      })
    );
  }
}

async function processImages(
  post: Record<string, unknown>,
  media: ImagePostMedia[]
) {
  const postId = String(post.postId);
  const profileId = String(post.profileId);
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
      const processedKey = `posts/processed/${profileId}/${postId}/${item.position}-${item.mediaId}.jpg`;

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
        ":profilePk": `PROFILE#${profileId}`,
        ":postSk": `POST#${String(post.createdAt)}#${postId}`
      }
    })
  );
}

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

    if (media.length === 1 && media[0]?.type === "VIDEO") {
      await submitVideoJob(post, media[0]);
      return;
    }

    await processImages(post, media.filter((item) => item.type === "IMAGE"));
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
              error instanceof Error ? error.message : "Media processing failed.",
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
