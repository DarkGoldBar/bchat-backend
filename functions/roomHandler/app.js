/** @typedef {import('../types.js').Room} Room */

const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

// 创建底层 DynamoDB 客户端
const ddbClient = new DynamoDBClient({});
// 创建文档客户端（支持自动转换 JS 对象）
const dynamo = DynamoDBDocumentClient.from(ddbClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE;

const maxRetries = 3;
const roomIdLength = 4;

module.exports.handler = async (event) => {
  const queryParams = event.queryStringParameters || {};

  const { type } = queryParams;

  if (!type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "type is required" }),
    };
  }

  return await createRoom(type);
};

async function createRoom(type) {
  /** @type {String} */
  let id = "";
  /** @type {Room} */
  let room = {
    id,
    type,
    members: [],
    lastState: "",
    metadata: {
      stage: "LOBBY",
      posLimit: 2, // 最大人数
    },
    createdAt: Math.floor(Date.now() / 1000), // 当前时间戳（秒）
    ttl: Math.floor(Date.now() / 1000) + 86400 * 7, // 7天后过期
    version: 1, // 乐观锁版本初始为1
  };

  for (let attempts = 0; attempts < maxRetries; attempts++) {
    id = generateRandomBase62String(roomIdLength);
    room.id = id;

    try {
      // 如果房间不存在，则可以创建
      await dynamo.send(
        new PutCommand({
          TableName: ROOMS_TABLE,
          Item: room,
          ConditionExpression: "attribute_not_exists(id)",
        })
      );
      return response(200, JSON.stringify(room));
    } catch (error) {
      if (error.code === "ConditionalCheckFailedException") {
        // 如果是因为条件检查失败（即房间已存在）
        continue;
      }

      // 其他错误直接抛出
      throw error;
    }
  }

  // 如果重试次数用完仍未成功
  return response(503, {
    message: "Service temporarily unavailable",
    details: "Unable to create room after maximum retries 3",
  });
}

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

function generateRandomBase62String(length) {
  const base62Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += base62Chars.charAt(
      Math.floor(Math.random() * base62Chars.length)
    );
  }
  return result;
}
