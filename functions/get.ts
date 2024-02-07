import Connection from "./lib/connect";
import { Logger } from "@aws-lambda-powertools/logger";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const logger = new Logger({ serviceName: "getLambda" });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const client = await Connection();
    // Connection
    await client.connect();
    logger.info("connected");

    // Query
    const res = await client.query(
      "SELECT * FROM sampleapp_table WHERE id = 1"
    );
    const response = {
      statusCode: 200,
      body:
        res.rows.length > 0 ? JSON.stringify(res.rows[0]) : JSON.stringify(""),
    };
    return response;
  } catch (e) {
    logger.error(e.toString());
    const response = {
      statusCode: 500,
      body: JSON.stringify("Server error"),
    };
    return response;
  }
};
