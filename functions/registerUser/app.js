const AWS = require("aws-sdk");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Register a new user
 * {
  "userId": "ZhangSan",
  "password": "123456",
  "avatar": "https://example.com/avatar.png"
 * }
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, password, avatar = "" } = body;

    if (!userId || !password) {
      return response(400, { error: "Missing userId or password" });
    }

    const name = userId;

    // 查询 userId 是否已存在
    const existingUser = await dynamo
      .get({
        TableName: USERS_TABLE,
        Key: { userId },
      })
      .promise();

    if (existingUser.Item) {
      return response(409, { error: "User ID already exists" });
    }

    // 加盐哈希处理
    const salt = "8f347ba0";
    const hashedPassword = crypto
      .createHash("md5")
      .update(password + salt)
      .digest("hex");

    const now = Date.now();

    // 插入到 DynamoDB
    await dynamo
      .put({
        TableName: USERS_TABLE,
        Item: {
          userId,
          name,
          avatar,
          password: `${hashedPassword}:${salt}`,
          connectionId: "",
          status: "offline",
          createdAt: now,
        },
      })
      .promise();

    return response(200, {
      userId,
      name,
      avatar,
      status: "offline",
      createdAt: now,
    });
  } catch (err) {
    console.error("Register error:", err);
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
