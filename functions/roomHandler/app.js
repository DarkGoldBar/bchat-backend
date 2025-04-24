const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamo = new AWS.DynamoDB.DocumentClient();
const ROOMS_TABLE = process.env.ROOMS_TABLE;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { members, metadata = {} } = body;

    if (!Array.isArray(members) || members.length === 0) {
      return response(400, { error: "Missing or invalid members" });
    }

    const roomId = uuidv4();
    const createdAt = Date.now();

    // TODO: 减少RoomID长度,增加尝试次数
    // TODO: 设置 room 的 ttl（自动过期清理）
    const item = {
      roomId,
      type: "game",
      members,
      metadata,
      updatedAt: createdAt,
    };

    await dynamo
      .put({
        TableName: ROOMS_TABLE,
        Item: item,
      })
      .promise();

    return response(200, item);
  } catch (err) {
    console.error("Create room error:", err);
    return response(500, { error: "Internal server error" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify(body),
  };
}
