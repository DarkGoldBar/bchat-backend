const AWS = require("aws-sdk");
const crypto = require("crypto");

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Login a user
 * example event:
 * {
  "userId": "ZhangSan",
  "password": "123456"
 * }
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, password } = body;

    if (!userId || !password) {
      return response(400, { error: "Missing userId or password" });
    }

    // 直接使用主键查询
    const result = await dynamo
      .get({
        TableName: USERS_TABLE,
        Key: { userId },
      })
      .promise();

    const user = result.Item;

    if (!user) {
      return response(404, { error: "User not found" });
    }

    const [storedHash, salt] = user.password.split(":");

    const inputHash = crypto
      .createHash("md5")
      .update(password + salt)
      .digest("hex");

    if (inputHash !== storedHash) {
      return response(401, { error: "Invalid password" });
    }

    // 返回登录成功用户信息（不包含密码）
    const { name, avatar, status, createdAt } = user;
    return response(200, { userId, name, avatar, status, createdAt });
  } catch (err) {
    console.error("Login error:", err);
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
