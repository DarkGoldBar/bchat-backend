/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */
/** @typedef {import('../types.js').WebSocketEvent} WebSocketEvent */

const {
  GetCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb')

const { lobbyHandler } = require('./handlerLobby')
const { wuziqiHandler } = require('./handlerWuziqi')
const { sendMessage, broadcastMessage } = require('./ifApiGateway')
const { dynamo } = require('./ifDynamoDB')

const ROOMS_TABLE = process.env.ROOMS_TABLE
const MAX_RETRIES = 3

module.exports.handler = async event => {
  const queryParams = event.queryStringParameters || {}
  const body = event.body ? JSON.parse(event.body) : {}
  const route = event.requestContext.routeKey
  const roomId = queryParams.room || body.room
  const subAction = body.subAction
  const connectId = event.requestContext.connectionId

  console.log(`READ route=${route};roomId=${roomId};connectId=${connectId};body=${event.body}`)

  for (let trials = 0; trials < MAX_RETRIES; trials++) {
    try {
      await router(route, subAction, roomId, connectId, body)
      return { statusCode: 200 }
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') {
        throw err
      }
    }
  }
  throw new Error('Max trials reached')
}

async function router(route, subAction, roomId, connectId, body) {
  if (route === '$connect') {
    return await handleConnect(connectId, roomId)
  }
  if (route === '$disconnect') {
    return await handleDisconnect(connectId)
  }

  const { room, user } = await getRoomAndUser(roomId, connectId)
  if (route === 'message') {
    return await messageHandler(room, user, body)
  }
  if (route === 'lobby') {
    return await lobbyHandler(subAction, room, user, body)
  }
  if (route === 'wuziqi') {
    return await wuziqiHandler(subAction, room, user, body)
  }

  throw new Error(`Invalid route: ${route}`)
}

/**
 * @param {string} connectId
 * @param {string} roomId
 */
async function handleConnect(connectId, roomId) {
  if (!roomId) {
    throw new Error(`Invalid param`)
  }
  // 保存关联 connectId -> roomId
  await dynamo.send(
    new PutCommand({
      TableName: ROOMS_TABLE,
      Item: {
        id: connectId,
        body: roomId,
        ttl: Math.floor(Date.now() / 1000) + 86400,
      },
    })
  )
}

/**
 * @param {string} connectId
 */
async function handleDisconnect(connectId) {
  // 获取关联 connectId -> roomId
  const connResult = await dynamo.send(
    new DeleteCommand({
      TableName: ROOMS_TABLE,
      Key: { id: connectId },
      ReturnValues: 'ALL_OLD',
    })
  )
  const roomId = connResult.Item.body
  const { room, user } = await getRoomAndUser(roomId, connectId)
  // 通知对应的hander
  if (room.stage === 'lobby') {
    await lobbyHandler('leave', room, user)
  } else if (room.stage === 'ingame') {
    await wuziqiHandler('leave', room, user)
  } else if (room.stage === 'gameover') {
    // 什么也不做
  } else {
    throw new Error(`Invalid room stage: ${room.stage}`)
  }
}

/**
 * @param {Room} room 
 * @param {User} user 
 * @param {Object} body 
 * @param {string} body.message
 * @param {string} body.sendto
 */
async function messageHandler(room, user, body) {
  const message = body.message
  if (!message) throw new Error(`Invalid param`)

  const target = room.members.find(m => m.uuid === body.sendto)
  if (target) {
    await sendMessage(target, { sender: user.uuid, message })
  } else {      
    await broadcastMessage(room, { sender: user.uuid, message })
  }
}

/**
 * @param {string} roomId
 * @param {string} connectId
 * @returns {Promise<{ room: Room, user?: User }>}
 */
async function getRoomAndUser(roomId, connectId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: ROOMS_TABLE,
      Key: { id: roomId },
    })
  )
  if (!result.Item) throw new Error('Invalid room')
  const room = result.Item
  room.members = result.Item.members.map(s => JSON.parse(s))
  const user = room.members.find(m => m.connectId === connectId) ?? { connectId }
  return { room, user }
}
