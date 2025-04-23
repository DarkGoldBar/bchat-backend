const AWS = require("aws-sdk");
const { verifyToken } = require("auth");

const dynamo = new AWS.DynamoDB.DocumentClient();
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;

exports.handler = async (event) => {
  const method = event.httpMethod;

  try {
    // 鉴权：从 Authorization header 中解析 Bearer token
    const token = getTokenFromHeader(event.headers);
    const payload = verifyToken(token); // 若无效则抛错
    event.user = payload; // 将 userId 等信息传给后续 handler

    if (method === "POST") {
      return await handleSend(event);
    } else if (method === "GET") {
      return await handleGet(event);
    } else {
      return response(405, { error: "Method Not Allowed" });
    }
  } catch (err) {
    console.error("Message handler error:", err);
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return response(401, { error: "Unauthorized" });
    }
    return response(500, { error: "Internal Server Error" });
  }
};

async function handleSend(event) {
  const body = JSON.parse(event.body || "{}");
  const { roomId, content, type = "text", metadata = {} } = body;
  const senderId = event.user.userId;

  if (!roomId || !content) {
    return response(400, { error: "Missing required fields" });
  }

  const timestamp = Date.now();

  await dynamo
    .put({
      TableName: MESSAGES_TABLE,
      Item: {
        roomId,
        timestamp,
        senderId,
        content,
        type,
        metadata,
      },
    })
    .promise();

  return response(200, {
    roomId,
    timestamp,
    senderId,
    content,
    type,
    metadata,
  });
}

async function handleGet(event) {
  const params = event.queryStringParameters || {};
  const roomId = params.roomId;
  const limit = parseInt(params.limit || "20");
  const before = parseInt(params.before || `${Date.now()}`);

  if (!roomId) {
    return response(400, { error: "Missing roomId" });
  }

  const result = await dynamo
    .query({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: "#r = :roomId AND #t < :before",
      ExpressionAttributeNames: {
        "#r": "roomId",
        "#t": "timestamp",
      },
      ExpressionAttributeValues: {
        ":roomId": roomId,
        ":before": before,
      },
      Limit: limit,
      ScanIndexForward: false,
    })
    .promise();

  return response(200, { items: result.Items || [] });
}

function getTokenFromHeader(headers) {
  const authHeader = headers?.Authorization || headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Invalid or missing Authorization header");
  }
  return authHeader.slice(7);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
