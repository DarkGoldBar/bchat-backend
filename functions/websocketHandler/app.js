const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient();
const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT, // 需通过环境变量注入完整 wss://.../prod
});

const USERS_TABLE = process.env.USERS_TABLE;

exports.handler = async (event) => {
  const route = event.requestContext.routeKey;

  switch (route) {
    case "$connect":
      return await handleConnect(event);
    case "$disconnect":
      return await handleDisconnect(event);
    case "$default":
    default:
      return await handleMessage(event);
  }
};

// 当客户端连接时
async function handleConnect(event) {
  const connectionId = event.requestContext.connectionId;
  const now = Date.now();

  // 可选择在 queryString 中传 userId 并在此处认证绑定
  const userId = event.queryStringParameters?.userId || `anon-${connectionId}`;

  await dynamo
    .update({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET connectionId = :connId, lastSeen = :now",
      ExpressionAttributeValues: {
        ":connId": connectionId,
        ":now": now,
      },
    })
    .promise()
    .catch((err) => {
      console.warn("User not found or error updating:", err);
    });

  return { statusCode: 200, body: "Connected." };
}

// 当客户端断开连接
async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;

  // 根据 connectionId 清空记录（粗略做法）
  const scan = await dynamo
    .scan({
      TableName: USERS_TABLE,
      FilterExpression: "connectionId = :connId",
      ExpressionAttributeValues: {
        ":connId": connectionId,
      },
      ProjectionExpression: "userId",
    })
    .promise();

  for (const user of scan.Items || []) {
    await dynamo
      .update({
        TableName: USERS_TABLE,
        Key: { userId: user.userId },
        UpdateExpression: "REMOVE connectionId",
      })
      .promise();
  }

  return { statusCode: 200, body: "Disconnected." };
}

// 默认接收消息并处理
async function handleMessage(event) {
  const connectionId = event.requestContext.connectionId;
  let body;

  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const message = body.message || "[empty message]";

  // 回送回当前连接
  await apiGateway
    .postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify({ echo: message }),
    })
    .promise()
    .catch((err) => {
      console.error("Failed to send echo:", err);
    });

  return { statusCode: 200, body: "Message received." };
}
