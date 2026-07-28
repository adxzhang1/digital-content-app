import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import {
  BatchGetCommand,
  QueryCommand,
  type QueryCommandOutput
} from "@aws-sdk/lib-dynamodb";
import {
  authErrorResponse,
  requireOnboardedUser
} from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { getMediaSigningConfig } from "../lib/media-config.js";
import { toProfileResponse } from "../lib/profiles.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");
const subscriptionsTableName = requireEnv("SUBSCRIPTIONS_TABLE_NAME");

type SubscriptionRecord = Record<string, unknown> & {
  createdAt?: string;
  targetProfileId?: string;
};

type ProfileKey = {
  PK: string;
  SK: "METADATA";
};

async function getProfiles(profileIds: string[]) {
  const profiles: Record<string, unknown>[] = [];

  for (let index = 0; index < profileIds.length; index += 100) {
    let keys: ProfileKey[] = profileIds
      .slice(index, index + 100)
      .map((profileId) => ({
        PK: `PROFILE#${profileId}`,
        SK: "METADATA"
      }));

    for (let attempt = 0; keys.length > 0 && attempt < 5; attempt += 1) {
      const result = await documentClient.send(
        new BatchGetCommand({
          RequestItems: {
            [profilesTableName]: {
              Keys: keys
            }
          }
        })
      );

      profiles.push(...(result.Responses?.[profilesTableName] ?? []));
      keys = (result.UnprocessedKeys?.[profilesTableName]?.Keys ??
        []) as ProfileKey[];

      if (keys.length > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * 2 ** attempt)
        );
      }
    }

    if (keys.length > 0) {
      throw new Error("Could not load all subscribed profiles.");
    }
  }

  return profiles;
}

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

  const subscriptions: SubscriptionRecord[] = [];
  let exclusiveStartKey: QueryCommandOutput["LastEvaluatedKey"];

  do {
    const result = await documentClient.send(
      new QueryCommand({
        TableName: subscriptionsTableName,
        ExclusiveStartKey: exclusiveStartKey,
        KeyConditionExpression: "PK = :subscriber",
        FilterExpression: "#status = :active",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":subscriber": `SUBSCRIBER#${authenticatedUser.profileId}`,
          ":active": "ACTIVE"
        }
      })
    );

    subscriptions.push(...((result.Items ?? []) as SubscriptionRecord[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  const profileIds = subscriptions
    .map((subscription) => subscription.targetProfileId)
    .filter((profileId): profileId is string => Boolean(profileId));

  if (profileIds.length === 0) {
    return json(200, {
      profiles: []
    });
  }

  const profiles = await getProfiles(profileIds);
  const profileById = new Map(
    profiles.map((profile) => [String(profile.profileId), profile])
  );
  const signingConfig = getMediaSigningConfig();
  const orderedProfiles = await Promise.all(
    subscriptions
      .sort((left, right) =>
        String(right.createdAt ?? "").localeCompare(
          String(left.createdAt ?? "")
        )
      )
      .map((subscription) =>
        subscription.targetProfileId
          ? profileById.get(subscription.targetProfileId)
          : undefined
      )
      .filter(
        (profile): profile is Record<string, unknown> => Boolean(profile)
      )
      .map((profile) => toProfileResponse(profile, signingConfig))
  );

  return json(200, {
    profiles: orderedProfiles
  });
}
