const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient();
const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT, // 需通过环境变量注入完整 wss://.../prod
});

const ROOM_TABLE = process.env.ROOM_TABLE;

exports.handler = async (event) => {
  const route = event.requestContext.routeKey;

  switch (route) {
    case "$connect":
      return await handleConnect(event);
    case "$disconnect":
      return await handleDisconnect(event);
    case "join":
      return await handleJoin(event);
    case "$default":
    default:
      return await handleMessage(event);
  }
};

async function handleConnect(event) {
  // 直接返回成功
  return { statusCode: 200 };
}

async function handleJoin(event) {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body);
  const { roomId, user } = body;

  // 获取房间信息
  const { Item: room } = await dynamo.get({
    TableName: ROOM_TABLE,
    Key: { id: roomId }
  }).promise();

  if (!room) {
    return { statusCode: 404 };
  }

  // 更新用户的 connectionId
  user.connectionID = connectionId;

  // 将用户添加到房间成员列表
  room.members.push(user);

  // 更新房间的 members
  await dynamo.update({
    TableName: ROOM_TABLE,
    Key: { id: roomId },
    UpdateExpression: 'SET members = list_append(members, :newMember)',
    ExpressionAttributeValues: {
      ':newMember': [user]
    }
  }).promise();

  // 广播更新
  await broadcast(room.members, {
    type: 'memberUpdate',
    members: room.members
  });

  return { statusCode: 200 };
}

async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;

  // 扫描所有房间找到包含此连接的用户
  const { Items: rooms } = await dynamo.scan({
    TableName: ROOM_TABLE
  }).promise();

  for (const room of rooms) {
    let updated = false;

    // 检查并更新 members
    room.members = room.members.map(member => {
      if (member.connectionID === connectionId) {
        updated = true;
        return { ...member, connectionID: null };
      }
      return member;
    });

    if (updated) {
      // 更新房间信息
      await dynamo.put({
        TableName: ROOM_TABLE,
        Item: room
      }).promise();

      // 广播更新
      await broadcast(room.members, {
        type: 'memberUpdate',
        members: room.members
      });
    }
  }

  return { statusCode: 200 };
}

async function handleMessage(event) {
  const body = JSON.parse(event.body);
  const { roomId, message } = body;

  // 获取房间信息
  const { Item: room } = await dynamo.get({
    TableName: ROOM_TABLE,
    Key: { id: roomId }
  }).promise();

  if (!room) {
    return { statusCode: 404 };
  }

  // 直接广播消息
  await broadcast(room.members, {
    type: 'message',
    message: message
  });

  return { statusCode: 200 };
}


// 广播函数
async function broadcast(users, payload) {
  const broadcasts = users.map(async (user) => {
    try {
      if (!user.connectionID) return;

      await apiGateway.postToConnection({
        ConnectionId: user.connectionID,
        Data: JSON.stringify(payload)
      }).promise();
    } catch (err) {
      if (err.statusCode === 410) {
        // 连接已断开，忽略错误
        console.log(`Connection ${user.connectionID} not found`);
      } else {
        throw err;
      }
    }
  });

  await Promise.all(broadcasts);
}
