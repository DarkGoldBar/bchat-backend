/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */
/** @typedef {import('../types.js').WebSocketEvent} WebSocketEvent */

const { GetCommand, PutCommand, UpdateCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

const ROOMS_TABLE = process.env.ROOMS_TABLE;
const WEBSOCKET_EP = process.env.WEBSOCKET_EP;
const MAX_MEMBER = 20;
const MAX_RETRIES = 3;

const ddbClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(ddbClient);
const apiGateway = new ApiGatewayManagementApiClient({ endpoint: WEBSOCKET_EP });

module.exports.handler = async (event) => {
  const queryParams = event.queryStringParameters || {};
  const body = event.body ? JSON.parse(event.body) : {};
  const route = body.action ?? event.requestContext.routeKey;
  const roomId = queryParams.room || body.room;
  const subAction = body.subAction;
  const connectId = event.requestContext.connectionId;

  console.log(`READ route=${route};roomId=${roomId};connectId=${connectId};body=${event.body}`)

  for (let trials = 0; trials < MAX_RETRIES; trials++) {
    try {
      await router(route, subAction, roomId, body, connectId);
      return { statusCode: 200 };
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") {
        throw err
      }
    }
  }
  throw new Error("Max trials reached");
}

async function router(route, subAction, roomId, body, connectId) {
  switch (route) {
    case "$connect":
      return await handleConnect(connectId, roomId);
    case "$disconnect":
      return await handleDisconnect(connectId);
    case "lobby":
      switch (subAction) {
        case "join":
          return await handleJoin(roomId, body, connectId);
        case "changePosition":
          return await handleChangePosition(roomId, body, connectId);
        case "changePosLimit":
          return await handleChangePosLimit(roomId, body);
        case "message":
          return await handleMessage(roomId, body, connectId);
      }
    case "wuziqi":
      return await handleWuziqi(subAction, roomId, body, connectId);
    case "$default":
    default:
      throw new Error(`Invalid route`);
  }
}

/**
 * @param {string} connectId
 * @param {string} roomId
 */
async function handleConnect(connectId, roomId) {
  if (!roomId) {
    throw new Error(`Invalid param`);
  }
  // 保存关联 connectId -> roomId
  await dynamo.send(
    new PutCommand({
      TableName: ROOMS_TABLE,
      Item: {
        id: connectId,
        body: roomId,
        ttl: Math.floor(Date.now() / 1000) + 86400
      },
    })
  );
}

/**
 * @param {string} connectId
 */
async function handleDisconnect(connectId) {
  // 获取关联 connectId -> roomId
  const connectResult = await dynamo.send(
    new GetCommand({
      TableName: ROOMS_TABLE,
      Key: { id: connectId },
    })
  );
  const roomId = connectResult.Item.body;
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  // 用connectId查找用户对象
  const user = room.members.find(m => m.connectId === connectId);
  const userIndex = room.members.indexOf(user);
  if (!user) throw new Error("Invalid user");
  // 根据用户的position更新用户的 connectId 或者删掉用户
  if (user.position) {
    user.connectId = null;
    await updateRoomUser(room, user, userIndex);
  } else {
    await deleteRoomUser(room, userIndex);
  }
  // 广播更新
  await broadcastMessage(room, {
    action: "userDisconnected",
    user: user,
  });
}

/**
 * @param {string} roomId
 * @param {object} body
 * @param {User} body.user
 * @param {string} connectId
 */
async function handleJoin(roomId, body, connectId) {
  if (!roomId || !body.user || !body.user.uuid || !body.user.name || !body.user.avatar) {
    throw new Error(`Invalid param`);
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  // 用connectId查找用户对象
  let user = room.members.find(m => m.connectId === connectId);
  if (user) {
    console.log("[lobby.join]User exist")
    user.connectId = connectId;
    const userIndex = room.members.indexOf(user);
    await updateRoomUser(room, user, userIndex);
  } else {
    console.log("[lobby.join]User not exist")
    if (room.members.length + 1 >= MAX_MEMBER) throw new Error("Max members reached");
    user = body.user;
    user.connectId = connectId;
    user.position = 0;
    await createRoomUser(room, user);
  }

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
}

/**
 * @param {string} roomId
 * @param {string} connectId
 * @param {{ position:number }} body
 */
async function handleChangePosition(roomId, body, connectId) {
  if (!body || body.position === undefined || body.position === null) {
    throw new Error(`Invalid param`);
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  // 用connectId查找用户对象
  const user = room.members.find(m => m.connectId === connectId);
  const userIndex = room.members.indexOf(user);
  if (!user) throw new Error("Invalid user");
  // 获取其他用户的位置, 如非0且重复则报错
  if ((body.position !== 0) && (room.members.some(m => m.position === body.position))) {
    throw new Error("Invalid position");
  }
  // 更新用户
  user.position = body.position;
  await updateRoomUser(room, user, userIndex);
  // 广播更新
  await broadcastMessage(room, {
    action: "userChangedPosition",
    user: user,
  });
}

/**
 * @param {string} roomId
 * @param {{ posLimit:number }} body
 */
async function handleChangePosLimit(roomId, body){
  if (!body || body.posLimit === undefined || body.posLimit === null) {
    throw new Error(`Invalid param`);
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  // 修改位置
  room.posLimit = body.posLimit;
  room.members.forEach(m => { if (m.position > room.posLimit) m.position = 0 });
  updateRoom(room);
  // BoardCast
  await broadcastMessage(room, {
    action: "init",
    room: room,
  });
}


/**
 * @param {string} roomId
 * @param {object} body
 * @param {string} body.sendto
 * @param {string} body.message
 * @param {string} connectId
 */
async function handleMessage(roomId, body, connectId) {
  if (!body || !body.sendto || !body.message) {
    throw new Error(`Invalid param`);
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  // 用connectId查找用户对象
  const user = room.members.find(m => m.connectId === connectId);
  const userIndex = room.members.indexOf(user);
  if (!user) throw new Error("Invalid user");
  // 用uuid查找用户对象
  const target = room.members.find(m => m.uuid === connectId);
  if (!target) throw new Error("Invalid target");
  // 发送消息
  await sendMessage(target, Object.assign(body, { sender: user.uuid }));
}

async function handleWuziqi(roomId, body, connectId) {
  if (!body) {
    throw new Error(`Invalid param`);
  }
  // 获取房间信息
  const result = await getRoomById(roomId);
  const room = result.Item;
  if (!room) throw new Error("Invalid room");
  const user = room.members.find(m => m.connectId === connectId);
  if (!user) throw new Error("Invalid user");
  // 执行逻辑
  console.log("DO SOMETHING")
}


/**
 * CREATE
 * @param {Room} room - 房间对象
 * @param {User} user - 要添加的用户对象
 */
async function createRoomUser(room, user) {
  const userString = JSON.stringify(user);

  const command = new UpdateCommand({
    TableName: ROOMS_TABLE,
    Key: { id: room.id },
    UpdateExpression:
      "SET #members = list_append(if_not_exists(#members, :empty), :newMember), #version = :newVer",
    ConditionExpression: "#version = :ver",
    ExpressionAttributeNames: {
      "#members": "members",
      "#version": "version",
    },
    ExpressionAttributeValues: {
      ":newMember": [userString],
      ":empty": [],
      ":ver": room.version,
      ":newVer": room.version + 1
    },
  });

  return await dynamo.send(command);
}

/**
 * READ
 * @param {string} roomId 
 * @returns {Promise<{ Item:Room }>}
 */
async function getRoomById(roomId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: ROOMS_TABLE,
      Key: { id: roomId }
    })
  );
  if (result.Item) {
    result.Item.members = result.Item.members.map(s => JSON.parse(s))
    return result;
  }
}

/**
 * UPDATE ROOM
 * @param {Room} room
 * @param {User} user
 * @param {number} index
 */
async function updateRoom(room) {
  const newRoom = {
    ...room,
    members: room.members.map(m => JSON.stringify(m)),
    version: room.version + 1,
  };
  const command = new PutCommand({
    TableName: ROOMS_TABLE,
    Item: newRoom,
    ConditionExpression: "#version = :ver",
    ExpressionAttributeNames: {
      "#version": "version",
    },
    ExpressionAttributeValues: {
      ":ver": room.version,
    },
  });
  await dynamo.send(command);
}


/**
 * UPDATE USER
 * @param {Room} room
 * @param {User} user
 * @param {number} index
 */
async function updateRoomUser(room, user, index) {
  const userString = JSON.stringify(user);

  const command = new UpdateCommand({
    TableName: ROOMS_TABLE,
    Key: { id: room.id },
    ConditionExpression: "#version = :ver",
    UpdateExpression: `SET #members[${index}] = :user, #version = :newVer`,
    ExpressionAttributeNames: {
      "#members": "members",
      "#version": "version",
    },
    ExpressionAttributeValues: {
      ":user": userString,
      ":ver": room.version,
      ":newVer": room.version + 1,
    },
    ReturnValues: "NONE",
  });
  await dynamo.send(command);
}


/**
 * DELETE
 * @param {Room} room - 房间对象
 * @param {number} index - 要删除的成员在 members 数组中的位置
 */
async function deleteRoomUser(room, index) {
  const command = new UpdateCommand({
    TableName: ROOMS_TABLE,
    Key: { id: room.id },
    UpdateExpression: `REMOVE #members[${index}] SET #version = :newVer`,
    ConditionExpression: "#version = :ver",
    ExpressionAttributeNames: {
      "#members": "members",
      "#version": "version",
    },
    ExpressionAttributeValues: {
      ":ver": room.version,
      ":newVer": room.version + 1,
    },
  });
  await dynamo.send(command);
}


/**
 * 向用户发送消息
 * @param {User} user
 * @param {Object} payload
 */
async function sendMessage(user, payload) {
  if (!user.connectId) return;
  if (user.connectId.startsWith('$TEST')) {
    console.log(JSON.stringify(payload));
    return;
  }
  try {
    const s = JSON.stringify(payload)
    await apiGateway.send(
      new PostToConnectionCommand({
        ConnectionId: user.connectId,
        Data: Buffer.from(s),
      })
    );
    console.log(`Post -> ${user.connectId}: ${s}`)
  } catch (err) {
    if (err.name === "GoneException" ) {
      console.warn(`GoneException ${user.connectId}`);
    } else {
      throw err;
    }
  }
}


/**
 * 广播消息到多个用户
 * @param {Room} room - 房间对象
 * @param {Object} payload - 消息 payload
 */
async function broadcastMessage(room, payload) {
  if (!room || !room.members || room.members.length === 0) {
    console.warn("No members in the room to broadcast to.");
    return;
  }
  const broadcasts = room.members
    .filter(m => m.connectId)
    .map(async (user) => sendMessage(user, payload));
  await Promise.all(broadcasts);
}
