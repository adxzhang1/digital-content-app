import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getAuthenticatedUser } from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const user = getAuthenticatedUser(event);

  if (!user?.firebaseUid) {
    return json(401, {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required."
    });
  }

  if (!user.userId || !user.profileId) {
    return json(200, {
      status: "needs_onboarding",
      firebaseUid: user.firebaseUid,
      email: user.email ?? ""
    });
  }

  const profileResult = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `PROFILE#${user.profileId}`,
        SK: "METADATA"
      }
    })
  );
  const profile = profileResult.Item;
  const username = profile?.username;
  const displayName = profile?.displayName;

  if (!username || !displayName) {
    return json(500, {
      code: "PROFILE_NOT_FOUND",
      message: "Profile could not be loaded."
    });
  }

  return json(200, {
    status: "ready",
    user: {
      firebaseUid: user.firebaseUid,
      email: user.email ?? "",
      userId: user.userId,
      profileId: user.profileId,
      username: String(username),
      displayName: String(displayName)
    }
  });
}
