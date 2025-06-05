/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */
/** @typedef {import('../types.js').WebSocketEvent} WebSocketEvent */

const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");
// 创建底层 DynamoDB 客户端
const ddbClient = new DynamoDBClient({});
// 创建文档客户端（支持自动转换 JS 对象）
const dynamo = DynamoDBDocumentClient.from(ddbClient);
// 创建 API Gateway Management API 客户端
const apiGateway = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});
// 获取环境变量中的房间表名
/** @type {string} */
const ROOM_TABLE = process.env.ROOM_TABLE;

/**
 * @param {WebSocketEvent} event - API Gateway
 * @returns {Promise<Object>} - API Gateway
 */
export const handler = async (event) => {
  const route = event.requestContext.routeKey;
  const queryParams = event.queryStringParameters || {};

  const roomId = queryParams.room;
  const body = JSON.parse(event.body);
  const connectId = event["requestContext"]["connectID"];

  if (!roomId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Room ID is required" }),
    };
  }

  try {
    switch (route) {
      case "$connect":
        return await handleConnect(roomId);
      case "$disconnect":
        return await handleDisconnect(roomId, connectId);
      case "join":
        return await handleJoin(roomId, body, connectId);
      case "changeposition":
        return await handleChangePosition(roomId, body, connectId);
      case "$default":
      default:
        return await handleMessage(event);
    }
  } catch (error) {
    console.error("Connection error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

async function handleConnect(roomId) {
  // 查询数据库中是否存在该房间
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  return { statusCode: 200 };
}

async function handleDisconnect(roomId, connectId) {
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  const room = result.Item;
  // 用connectId查找用户对象
  const userResult = getUserByconnectID(room, connectId);
  if (userResult.error) {
    return userResult.error;
  }
  const user = userResult.user;
  // 根据用户的position更新用户的 connectID 或者删掉用户
  if (user.position) {
    user.connectID = null;
    await updateRoomUser(room, user, userResult.index);
  } else {
    await deleteRoomUser(room, user, userResult.index);
  }
  // 广播更新
  const payload = {
    action: "userDisconnected",
    user: user,
  };
  await broadcast(room, payload);
  return { statusCode: 200 };
}

async function handleJoin(roomId, body, connectId) {
  // 获取房间信息
  // 更新用户的 connectID
  // 将用户添加到房间成员列表
  // 更新房间的 members
  // 广播更新
}

async function handleChangePosition(roomId, body, connectId) {
  // 获取房间信息
}

async function handleMessage(event) {}

/**
 * 广播消息到多个用户
 *
 * @param {Room} room - 用户列表
 * @param {Object} payload - 消息 payload
 * @returns {Promise<void>}
 */
async function broadcast(room, payload) {
  if (!room || !room.members || room.members.length === 0) {
    console.warn("No members in the room to broadcast to.");
    return;
  }
  // 获取房间成员列表
  const users = room.members
    .map((member) => {
      try {
        return JSON.parse(member);
      } catch (e) {
        return null;
      }
    })
    .filter((user) => user && user.connectID);

  const broadcasts = users.map(async (/** @type {User} */ user) => {
    try {
      if (!user.connectID) return;

      await apiGateway.send(
        new PostToConnectionCommand({
          ConnectionId: user.connectID,
          Data: Buffer.from(JSON.stringify(payload)),
        })
      );
    } catch (err) {
      if (err.statusCode === 410) {
        // 连接已断开，忽略错误
        console.log(`Connection ${user.connectID} not found`);
      } else {
        throw err;
      }
    }
  });

  await Promise.all(broadcasts);
}

/**
 * 使用乐观锁更新房间中的用户数据
 * @param {Room} room - 当前房间对象
 * @param {User} user - 需要更新的用户对象
 * @param {number} index - 用户在 members 数组中的位置
 * @returns {Promise<{statusCode: number, error?: string}>}
 */
export async function updateRoomUser(room, user, index) {
  try {
    const result = await ddbClient.send(
      new UpdateCommand({
        TableName: ROOM_TABLE, // 确保与你 DynamoDB 中的表名一致
        Key: { id: room.id },
        ConditionExpression: "#ver = :ver",
        UpdateExpression: `SET #members[${index}].connectID = :cid, #ver = :newVer`,
        ExpressionAttributeNames: {
          "#members": "members",
          "#ver": "version",
        },
        ExpressionAttributeValues: {
          ":cid": user.connectID,
          ":ver": room.version,
          ":newVer": room.version + 1,
        },
        ReturnValues: "NONE",
      })
    );

    return { statusCode: 200 };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        error: "Version mismatch — concurrent update detected.",
      };
    }
    return { statusCode: 500, error: err.message || "Unknown error" };
  }
}

/**
 * 删除指定 index 的成员，仅当其字符串等于当前 user 对象的 JSON 表达
 * @param {Room} room - 房间对象
 * @param {User} user - 用户对象（将被 stringified）
 * @param {number} index - 要删除的成员在 members 数组中的位置
 * @returns {Promise<{statusCode: number, error?: string}>}
 */
async function deleteRoomUser(room, user, index) {
  try {
    const userString = JSON.stringify(user);

    const command = new UpdateCommand({
      TableName: "Room",
      Key: { id: room.id },
      UpdateExpression: `REMOVE #members[${index}] SET #version = :newVer`,
      ConditionExpression: `#members[${index}] = :expected`,
      ExpressionAttributeNames: {
        "#members": "members",
        "#version": "version",
      },
      ExpressionAttributeValues: {
        ":expected": userString,
        ":newVer": (room.version || 0) + 1,
      },
    });

    await dynamo.send(command);

    return { statusCode: 200 };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        error: "Mismatch: user at target index is not as expected",
      };
    }
    return {
      statusCode: 500,
      error: err.message || "Failed to delete room member",
    };
  }
}

/**
 * @typedef {Object} getRoomResult
 * @property {Room?} Item - 房间对象
 * @property {Object?} error - 错误信息
 * @property {number} error.statusCode - HTTP 状态码
 * @property {string} error.body - 错误消息
 */

/**
 * 从数据库中获取房间
 *
 * @param {string} roomId - Room id
 * @returns {Promise<getRoomResult>}
 */
async function getRoomById(roomId) {
  /** @type {getRoomResult} */
  const result = {};

  // 查询数据库中是否存在该房间
  const command = new GetCommand({
    TableName: ROOM_TABLE,
    Key: {
      roomId: roomId,
    },
  });

  try {
    Object.assign(result, await dynamo.send(command));

    if (!result.Item) {
      result.error = {
        statusCode: 404,
        body: JSON.stringify({ message: "Room not found" }),
      };
    }
  } catch (dbError) {
    // 数据库查询错误
    console.error("Database error:", dbError);
    result.error = {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }

  return result;
}

/**
 * @typedef {Object} getUserResult
 * @property {User?} user - 用户对象
 * @property {number?} index - 用户的索引位置
 * @property {Object?} error - 错误信息
 * @property {number} error.statusCode - HTTP 状态码
 * @property {string} error.body - 错误消息
 */

/**
 * 根据连接 ID 获取用户
 *
 * @param {Room} room - 房间信息
 * @param {string} connectId - 连接 ID
 * @returns {getUserResult}
 */
function getUserByconnectID(room, connectId) {
  /** @type {getUserResult} */
  const result = {};

  /** @type {string} */
  let userString = null;
  const query = `"connectID":"${connectId}"`;
  if (room && room.members) {
    userString = room.members.find((s) => s.includes(query));
    result.index = room.members.indexOf(userString);
  }
  if (userString) {
    try {
      result.user = JSON.parse(userString);
    } catch (e) {
      result.error = {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid user data" }),
      };
    }
  } else {
    result.error = {
      statusCode: 404,
      body: JSON.stringify({ message: "User not found" }),
    };
  }

  return result;
}
