import Connection from "./lib/connect";
import { Logger } from "@aws-lambda-powertools/logger";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { isBoolean } from "lodash";

const logger = new Logger({ serviceName: "postLambda" });

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    const response = {
      statusCode: 400,
      body: JSON.stringify("Body is null"),
    };
    logger.error("Body is null");
    return response;
  }
  const body = JSON.parse(event.body);
  const [
    id,
    job0001_flag,
    job0002_flag,
    job0003_flag,
    job0004_flag,
    job0005_flag,
  ] = body;

  // check if there is data
  if (
    !id ||
    !job0001_flag ||
    !job0002_flag ||
    !job0003_flag ||
    !job0004_flag ||
    !job0005_flag
  ) {
    const response = {
      statusCode: 400,
      body: JSON.stringify("Some parameters are undefined"),
    };
    logger.error("Some parameters are undefined");
    return response;
  }
  // check their types and formats
  if (Number.isNaN(parseInt(id))) {
    logger.error("id is not a number");
    return { statusCode: 400, body: JSON.stringify("id is not a number") };
  }
  if (
    isBoolean(job0001_flag) ||
    isBoolean(job0002_flag) ||
    isBoolean(job0003_flag) ||
    isBoolean(job0004_flag) ||
    isBoolean(job0005_flag)
  ) {
    logger.error("Any flag parameters are not Boolean");
    return {
      statusCode: 400,
      body: JSON.stringify("Any flag parameters are not Boolean"),
    };
  }

  try {
    const client = await Connection();
    // Connection
    await client.connect();
    logger.info("connected");

    // Query
    const res = await client.query(
      "UPDATE sampleapp_table SET job0001_flag = $1, job0002_flag = $2, job0003_flag = $3, job0004_flag = $4, job0005_flag = $5 WHERE id = $6",
      [job0001_flag, job0002_flag, job0003_flag, job0004_flag, job0005_flag, id]
    );
    const response = {
      statusCode: 200,
      body: JSON.stringify(res),
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
