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
import { getProfileById } from "../lib/profiles.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");
const subscriptionsTableName = requireEnv("SUBSCRIPTIONS_TABLE_NAME");

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

  const profileId = event.pathParameters?.profileId?.trim();

  if (!profileId) {
    return json(400, {
      code: "PROFILE_ID_REQUIRED",
      message: "Profile ID is required."
    });
  }

  const profile = await getProfileById(profilesTableName, profileId);

  if (!profile) {
    return json(404, {
      code: "PROFILE_NOT_FOUND",
      message: "Profile not found."
    });
  }

  const targetProfileId = profile.profileId;

  if (targetProfileId === authenticatedUser.profileId) {
    return json(200, {
      subscribed: false
    });
  }

  const result = await documentClient.send(
    new GetCommand({
      TableName: subscriptionsTableName,
      Key: {
        PK: `USER#${authenticatedUser.userId}`,
        SK: `SUBSCRIPTION#${targetProfileId}`
      }
    })
  );
  const subscription = result.Item;
  const subscribed = subscription?.status === "ACTIVE";

  return json(200, {
    subscribed
  });
}
