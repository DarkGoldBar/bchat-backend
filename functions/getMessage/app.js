const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient();
const MESSAGES_TABLE = process.env.MESSAGES_TABLE;

exports.handler = async (event) => {
  try {
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
        KeyConditionExpression: "#roomId = :roomId AND #timestamp < :before",
        ExpressionAttributeNames: {
          "#roomId": "roomId",
          "#timestamp": "timestamp",
        },
        ExpressionAttributeValues: {
          ":roomId": roomId,
          ":before": before,
        },
        Limit: limit,
        ScanIndexForward: false, // 倒序排列（新 -> 旧）
      })
      .promise();

    return response(200, {
      items: result.Items || [],
    });
  } catch (err) {
    console.error("Get messages error:", err);
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
