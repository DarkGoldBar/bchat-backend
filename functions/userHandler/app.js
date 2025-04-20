const AWS = require("aws-sdk");
const { signToken } = require("bchat-shared");

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

exports.handler = async (event) => {
  const action = event.queryStringParameters?.action;
  const body = JSON.parse(event.body || "{}");

  try {
    if (action === "register") {
      return await handleRegister(body);
    } else if (action === "login") {
      return await handleLogin(body);
    } else {
      return response(400, { error: "Invalid action" });
    }
  } catch (err) {
    console.error(`${action} error:`, err);
    return response(500, { error: "Internal server error" });
  }
};

async function handleRegister({ userId, password, avatar = "" }) {
  if (!userId || !password) {
    return response(400, { error: "Missing userId or password" });
  }

  if (!/^[a-zA-Z0-9]+$/.test(userId)) {
    return response(400, {
      error: "userId must contain only letters and numbers",
    });
  }

  // 检查是否已存在
  const existing = await dynamo
    .get({
      TableName: USERS_TABLE,
      Key: { userId },
    })
    .promise();

  if (existing.Item) {
    return response(409, { error: "User already exists" });
  }

  const now = Date.now();

  const name = userId;

  await dynamo
    .put({
      TableName: USERS_TABLE,
      Item: {
        userId,
        name,
        avatar,
        password,
        connectionId: "",
        createdAt: now,
      },
    })
    .promise();

  const token = signToken(userId);

  return response(200, {
    userId,
    name,
    avatar,
    createdAt: now,
    token,
  });
}

async function handleLogin({ userId, password }) {
  if (!userId || !password) {
    return response(400, { error: "Missing userId or password" });
  }

  const result = await dynamo
    .get({
      TableName: USERS_TABLE,
      Key: { userId },
    })
    .promise();

  const user = result.Item;
  if (!user) return response(404, { error: "User not found" });

  if (password !== user.password) {
    return response(401, { error: "Invalid password" });
  }

  const token = signToken(userId);
  const { name, avatar, createdAt } = user;

  return response(200, { userId, name, avatar, createdAt, token });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
