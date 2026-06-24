import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";

export const json = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS"
  },
  body: JSON.stringify(body)
});

export const parseJsonBody = (event: APIGatewayProxyEventV2) => {
  if (!event.body) {
    return {};
  }

  return JSON.parse(event.body) as unknown;
};
