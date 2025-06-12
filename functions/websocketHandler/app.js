/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */
/** @typedef {import('../types.js').WebSocketEvent} WebSocketEvent */
/** @typedef {import('../types.js').WebSocketResult} WebSocketResult */

const { GetCommand, UpdateCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");

/** @type {string} */
const ROOMS_TABLE = process.env.ROOMS_TABLE;
const MAX_MEMBER = 20;
const MAX_409_RETRY = 3;

const ddbClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(ddbClient);
const apiGateway = new ApiGatewayManagementApiClient({});

/**
 * @param {WebSocketEvent} event - API Gateway
 * @returns {Promise<WebSocketResult>} - API Gateway
 */
module.exports.handler = async (event) => {
  const route = event.requestContext.routeKey;
  const queryParams = event.queryStringParameters || {};

  const roomId = queryParams.room;
  const body = event.body ? JSON.parse(event.body) : {};
  const subAction = body.subAction;
  const connectId = event.requestContext.connectID;

  console.log(`READ route=${route};roomId=${roomId};connectId=${connectId};body=${event.body}`)

  if (!roomId) {
    return {
      statusCode: 400,
      body: "Room ID is required",
    };
  }

  /** @type {WebSocketResult} */
  let result = { statusCode: 500 };
  for (let trials = 0; trials < MAX_409_RETRY; trials++) {
    result = await router();
    console.log("WRITE", JSON.stringify(result))
    if (result.statusCode !== 409) break;
  }
  return result;

  /**
   * @returns {Promise<WebSocketResult>}
   */
  async function router() {
    switch (route) {
      case "$connect":
        return await handleConnect(roomId);
      case "$disconnect":
        return await handleDisconnect(roomId, connectId);
      case "lobby":
        switch (subAction) {
          case "join":
            return await handleJoin(roomId, body, connectId);
          case "changeposition":
            return await handleChangePosition(roomId, body, connectId);
          case "message":
            return await handleMessage(roomId, body, connectId);
        }
      case "wuziqi":
        return await handleWuziqi(roomId, body, connectId);
      case "$default":
      default:
        return {
          statusCode: 400,
          body: "Invalid action",
        };
    }
  }
};

async function handleConnect(roomId) {
  // 查询数据库中是否存在该房间
  const result = await getRoomById(roomId);
  if (result.error) return result.error;
  return { statusCode: 200 };
}

async function handleDisconnect(roomId, connectId) {
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) return result.error;
  const room = result.Item;
  // 用connectId查找用户对象
  const userResult = getUserByID(room, "connectId", connectId);
  if (userResult.error) return userResult.error;
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
  await broadcastMessage(room, payload);
  return { statusCode: 200 };
}

/**
 * @param {string} roomId
 * @param {object} body
 * @param {User} body.user
 * @param {string} connectId
 * @returns {Promise<WebSocketResult>}
 */
async function handleJoin(roomId, body, connectId) {
  if (!body.user || !body.user.uuid || !body.user.name || !body.user.avatar) {
    return {
      statusCode: 400,
      body: "Invalid body",
    };
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  const room = result.Item;
  // 用uuid查找用户对象
  const userResult = getUserByID(room, "uuid", body.user.uuid);
  if (userResult.error) {
    if (userResult.error.statusCode === 404) {
      // 如果用户不存在向数据库的members添加这个user
      const user = body.user;
      user.connectID = connectId;
      user.position = 0;
      createRoomUser(room, user);
    } else {
      return userResult.error;
    }
  }
  // 如果用户存在则更新connectId，然后向数据库的members更新这个user
  const user = userResult.user;
  user.connectID = connectId;
  await updateRoomUser(room, user, userResult.index);
  // 广播更新
  await broadcastMessage(room, {
    action: "userJoined",
    user: user,
  });
  room.members.push(JSON.stringify(user));
  await sendMessage(user, {
    action: "init",
    room: room,
  });
  return { statusCode: 200 };
}

/**
 * @param {string} roomId
 * @param {object} body
 * @param {number} body.position
 * @param {string} connectId
 * @returns {Promise<WebSocketResult>}
 */
async function handleChangePosition(roomId, body, connectId) {
  if (!body || body.position === undefined || body.position === null) {
    return {
      statusCode: 400,
      body: "Invalid body",
    };
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  const room = result.Item;
  // 用connectId查找用户对象
  const userResult = getUserByID(room, "connectId", connectId);
  if (userResult.error) {
    return userResult.error;
  }
  const user = userResult.user;
  // 获取其他用户的位置, 如重复且非0则报错
  if (body.position !== 0) {
    const users = parseMembers(room.members).filter(
      (u) => u.uuid !== user.uuid
    );
    if (users.some((u) => u.position === body.position)) {
      return {
        statusCode: 400,
        body: "Invalid parameter",
      };
    }
  }
  // 更新用户
  user.position = body.position;
  await updateRoomUser(room, user, userResult.index);
  // 广播更新
  const payload = {
    action: "userChangedPosition",
    user: user,
  };
  await broadcastMessage(room, payload);
  return { statusCode: 200 };
}

/**
 * @param {string} roomId
 * @param {object} body
 * @param {string} body.sendto
 * @param {string} body.message
 * @param {string} connectId
 * @returns {Promise<WebSocketResult>}
 */
async function handleMessage(roomId, body, connectId) {
  if (!body || !body.sendto || !body.message) {
    return {
      statusCode: 400,
      body: "Invalid body",
    };
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  const room = result.Item;
  // 用connectId查找用户对象
  const userResult = getUserByID(room, "connectId", connectId);
  if (userResult.error) {
    return userResult.error;
  }
  const user = userResult.user;
  // 用uuid查找用户对象
  const targetResult = getUserByID(room, "uuid", body.sendto);
  if (targetResult.error) {
    return targetResult.error;
  }
  const target = targetResult.user;
  // 发送消息
  await sendMessage(target, Object.assign(body, { sender: user.uuid }));
  return { statusCode: 200 };
}

async function handleWuziqi(roomId, body, connectId) {
  if (!body) {
    return {
      statusCode: 400,
      body: "Invalid body",
    };
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  if (result.error) {
    return result.error;
  }
  const room = result.Item;
  // 用connectId查找用户对象
  const userResult = getUserByID(room, "connectId", connectId);
  if (userResult.error) {
    return userResult.error;
  }
  const user = userResult.user;
  // 执行逻辑
  console.log("DO SOMETHING")
  // 写入数据库
  console.log("WRITE DATABASE")
  return { statusCode: 200 };
}

/**
 * 广播消息到多个用户
 * @param {Room} room - 用户列表
 * @param {Object} payload - 消息 payload
 */
async function broadcastMessage(room, payload) {
  if (!room || !room.members || room.members.length === 0) {
    console.warn("No members in the room to broadcast to.");
    return;
  }
  // 获取房间成员列表
  const users = parseMembers(room.members).filter((u) => u.connectID);

  const broadcasts = users.map(async (/** @type {User} */ user) => {
    sendMessage(user, payload);
  });

  await Promise.all(broadcasts);
}

/**
 * 向用户发送消息
 * @param {User} user
 * @param {Object} payload
 */
async function sendMessage(user, payload) {
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
}

/**
 * 向房间添加新成员
 * @param {{Room}} room - 房间对象
 * @param {{User}} user - 要添加的用户对象
 * @returns {{Promise<{WebSocketResult}>}}
 */
async function createRoomUser(room, user) {
  try {
    const userString = JSON.stringify(user);

    const command = new UpdateCommand({
      TableName: "Room",
      Key: { id: room.id },
      UpdateExpression:
        "SET #members = list_append(if_not_exists(#members, :empty), :newMember), #version = :newVer",
      ConditionExpression: "size(#members) < :maxSize && #version = :ver",
      ExpressionAttributeNames: {
        "#members": "members",
        "#version": "version",
      },
      ExpressionAttributeValues: {
        ":newMember": [userString],
        ":empty": [],
        ":maxSize": MAX_MEMBER, // 设置最大成员数限制
        ":newVer": (room.version || 0) + 1,
        ":ver": room.version || 0,
      },
    });

    await dynamo.send(command);

    return { statusCode: 200 };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      if (room.members.length > MAX_MEMBER - 3) {
        return {
          statusCode: 400,
          body: "Room is full",
        };
      } else {
        return {
          statusCode: 409,
          body: "Version mismatch — concurrent update detected.",
        };
      }
    }
    return {
      statusCode: 500,
      body: err.message || "Failed to create room member",
    };
  }
}

/**
 * 更新房间中的用户数据
 * @param {Room} room - 当前房间对象
 * @param {User} user - 需要更新的用户对象
 * @param {number} index - 用户在 members 数组中的位置
 * @returns {Promise<{statusCode: number, body?: string}>}
 */
async function updateRoomUser(room, user, index) {
  try {
    const result = await ddbClient.send(
      new UpdateCommand({
        TableName: ROOMS_TABLE, // 确保与你 DynamoDB 中的表名一致
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
        body: "Version mismatch — concurrent update detected.",
      };
    }
    return { statusCode: 500, body: err.message || "Unknown error" };
  }
}

/**
 * 删除指定 index 的成员，仅当其字符串等于当前 user 对象的 JSON 表达
 * @param {Room} room - 房间对象
 * @param {User} user - 用户对象（将被 stringified）
 * @param {number} index - 要删除的成员在 members 数组中的位置
 * @returns {Promise<{statusCode: number, body?: string}>}
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
        body: "Version mismatch — concurrent update detected.",
      };
    }
    return {
      statusCode: 500,
      body: err.message || "Failed to delete room member",
    };
  }
}

/**
 * @typedef {Object} getRoomResult
 * @property {Room} Item - 房间对象
 * @property {Object} [error] - 错误信息
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
    TableName: ROOMS_TABLE,
    Key: {
      id: roomId,
    },
  });

  try {
    Object.assign(result, await dynamo.send(command));

    if (!result.Item) {
      result.error = {
        statusCode: 404,
        body: "Room not found",
      };
    }
  } catch (dbError) {
    // 数据库查询错误
    console.error("Database error:", dbError);
    result.error = {
      statusCode: 500,
      body: "Database error",
    };
  }

  return result;
}

/**
 * @typedef {Object} getUserResult
 * @property {User} user - 用户对象
 * @property {number} index - 用户的索引位置
 * @property {Object} [error] - 错误信息
 * @property {number} error.statusCode - HTTP 状态码
 * @property {string} error.body - 错误消息
 */

/**
 * 根据连接 ID 获取用户
 *
 * @param {Room} room - 房间信息
 * @param {'connectId' | 'uuid'} by - ID类型
 * @param {string} id - 连接 ID
 * @returns {getUserResult}
 */
function getUserByID(room, by, id) {
  /** @type {getUserResult} */
  const result = {};

  /** @type {string} */
  let userString = null;
  const query = `"${by}":"${id}"`;
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
        body: "Invalid user data",
      };
    }
  } else {
    result.error = {
      statusCode: 404,
      body: "User not found",
    };
  }

  return result;
}

function parseMembers(userStringArr) {
  const users = userStringArr.members
    .map((member) => {
      try {
        return JSON.parse(member);
      } catch (e) {
        return null;
      }
    })
    .filter((u) => u);
  return users;
}
