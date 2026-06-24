import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { documentClient } from "./dynamodb.js";

export type ProfileRecord = Record<string, unknown> & {
  profileId: string;
};

export async function getProfileByUsername(
  profilesTableName: string,
  username: string
): Promise<ProfileRecord | undefined> {
  const usernameResult = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `USERNAME#${username}`,
        SK: "METADATA"
      }
    })
  );

  const profileId = usernameResult.Item?.profileId;

  if (!profileId) {
    return undefined;
  }

  const profileResult = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `PROFILE#${String(profileId)}`,
        SK: "METADATA"
      }
    })
  );

  return profileResult.Item as ProfileRecord | undefined;
}
