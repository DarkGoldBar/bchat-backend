/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */

const { broadcastMessage } = require('./ifApiGateway')
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const dynamo = DynamoDBDocumentClient.from(ddbClient)

const ROOMS_TABLE = process.env.ROOMS_TABLE
const MAX_MEMBER = 20

const ActionMap = {
  join: handleJoin,
  leave: handleLeave,
  startGame: handleStartGame,
  changePosition: handleChangePosition,
  changePosLimit: handleChangePosLimit,
  changeSelf: handleChangeSelf,
}

/**
 * @param {string} subAction
 * @param {Room} room
 * @param {User} user
 * @param {object?} context
 * @returns
 */
module.exports.lobbyHandler = async (subAction, room, user, context) => {
  if (!subAction || !room || !user) throw new Error(`Invalid param`)
  if (!ActionMap[subAction]) throw new Error(`Invalid subAction: ${subAction}`)
  return await ActionMap[subAction](room, user, context)
}

/**
 * @param {Room} room
 * @param {object} context
 * @param {User} context.user
 */
async function handleJoin(room, { connectId }, context) {
  if (
    !context ||
    !context.user ||
    !context.user.uuid ||
    !context.user.name ||
    !context.user.avatar ||
    !connectId
  ) {
    throw new Error(`Invalid param`)
  }
  let user = room.members.find(m => m.uuid === context.user.uuid)
  if (user) {
    console.log('User exist')
    user.connectId = connectId
    const userIndex = room.members.indexOf(user)
    // 更新数据库
    await updateRoomMember(room, userIndex)
  } else {
    console.log('User not exist')
    if (room.members.length + 1 >= MAX_MEMBER) throw new Error('Max members reached')
    user = context.user
    user.connectId = connectId
    user.position = 0
    room.members.push(user)
    // 更新数据库
    const userString = JSON.stringify(user)
    const command = new UpdateCommand({
      TableName: ROOMS_TABLE,
      Key: { id: room.id },
      UpdateExpression:
        'SET #members = list_append(if_not_exists(#members, :empty), :newMember), #version = :newVer',
      ConditionExpression: '#version = :ver',
      ExpressionAttributeNames: {
        '#members': 'members',
        '#version': 'version',
      },
      ExpressionAttributeValues: {
        ':newMember': [userString],
        ':empty': [],
        ':ver': room.version,
        ':newVer': room.version + 1,
      },
    })

    await dynamo.send(command)
  }
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
}

/**
 * @param {Room} room
 * @param {User} user
 */
async function handleLeave(room, user) {
  const userIndex = room.members.indexOf(user)
  if (userIndex < 0) throw new Error(`User not found in room: ${user.uuid} ${user.connectId}`)
  room.members.splice(userIndex, 1)
  // 更新数据库
  await dynamo.send(
    new UpdateCommand({
      TableName: ROOMS_TABLE,
      Key: { id: room.id },
      UpdateExpression: `REMOVE #members[${userIndex}] SET #version = :newVer`,
      ConditionExpression: '#version = :ver',
      ExpressionAttributeNames: {
        '#members': 'members',
        '#version': 'version',
      },
      ExpressionAttributeValues: {
        ':ver': room.version,
        ':newVer': room.version + 1,
      },
    })
  )
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
}

/**
 * @param {Room} room
 * @param {User} user
 * @param {object} context
 * @param {number} context.position
 */
async function handleChangePosition(room, user, context) {
  // 校验
  const position = context.position
  if (position === undefined || position === null) {
    throw new Error(`Invalid param`)
  }
  // 逻辑
  if (position !== 0 && room.members.some(m => m.position === position)) {
    throw new Error('Invalid position')
  }
  user.position = position
  userIndex = room.members.indexOf(user)
  // 更新数据库
  await updateRoomMember(room, userIndex)
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
}

/**
 * @param {Room} room
 * @param {User} user
 * @param {object} context
 * @param {User} context.me
 */
async function handleChangeSelf(room, user, context) {
  // 校验
  const me = context.me
  if (!me) throw new Error(`Invalid param`)
  // 逻辑
  user.name = me.name
  user.avatar = me.avatar
  userIndex = room.members.indexOf(user)
  // 更新数据库
  await updateRoomMember(room, userIndex)
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
}

/**
 * @param {Room} room
 * @param {User} user
 * @param {object} context
 * @param {number} context.posLimit
 */
async function handleChangePosLimit(room, user, context) {
  // 校验
  const posLimit = context.posLimit
  if (position === undefined || position === null) {
    throw new Error(`Invalid param`)
  }
  // 逻辑
  room.posLimit = posLimit
  room.members.forEach(m => {
    if (m.position > posLimit) {
      m.position = 0
    }
  })
  // 更新数据库
  await updateRoom(room)
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
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
  }
  const command = new PutCommand({
    TableName: ROOMS_TABLE,
    Item: newRoom,
    ConditionExpression: '#version = :ver',
    ExpressionAttributeNames: {
      '#version': 'version',
    },
    ExpressionAttributeValues: {
      ':ver': room.version,
    },
  })
  await dynamo.send(command)
}

/**
 * UPDATE USER
 * @param {Room} room
 * @param {User} user
 * @param {number} index
 */
async function updateRoomMember(room, index) {
  const userString = JSON.stringify(room.members[index])

  const command = new UpdateCommand({
    TableName: ROOMS_TABLE,
    Key: { id: room.id },
    ConditionExpression: '#version = :ver',
    UpdateExpression: `SET #members[${index}] = :user, #version = :newVer`,
    ExpressionAttributeNames: {
      '#members': 'members',
      '#version': 'version',
    },
    ExpressionAttributeValues: {
      ':user': userString,
      ':ver': room.version,
      ':newVer': room.version + 1,
    },
    ReturnValues: 'NONE',
  })
  await dynamo.send(command)
}
