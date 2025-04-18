const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient();
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;

/**
 * Send a message to a room
 * example event:
 * {
  "roomId": "ZhangSan&LiSi",
  "senderId": "ZhangSan",
  "content": "hello world",
  "type": "text",
  "metadata": {}
 * }
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { roomId, senderId, content, type = "text", metadata = {} } = body;

    if (!roomId || !senderId || !content) {
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
      type,
      content,
      metadata,
    });
  } catch (err) {
    console.error("Send message error:", err);
    return response(500, { error: "Internal server error" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
