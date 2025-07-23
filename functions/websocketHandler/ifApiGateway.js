/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi')
const WEBSOCKET_EP = process.env.WEBSOCKET_EP
const apiGateway = new ApiGatewayManagementApiClient({ endpoint: WEBSOCKET_EP })


/**
 * 向用户发送消息
 * @param {User} user
 * @param {Object} payload
 */
async function sendMessage(user, payload) {
  if (!user.connectId) return
  if (user.connectId.startsWith('$TEST')) {
    console.log(JSON.stringify(payload))
    return
  }
  try {
    const s = JSON.stringify(payload)
    await apiGateway.send(
      new PostToConnectionCommand({
        ConnectionId: user.connectId,
        Data: Buffer.from(s),
      })
    )
    console.log(`Post -> ${user.connectId}: ${s}`)
  } catch (err) {
    if (err.name === 'GoneException') {
      console.warn(`GoneException ${user.connectId}`)
    } else {
      throw err
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
    console.warn('No members in the room to broadcast to.')
    return
  }
  const broadcasts = room.members
    .filter(m => m.connectId)
    .map(async user => sendMessage(user, payload))
  await Promise.all(broadcasts)
}

module.exports.sendMessage = sendMessage
module.exports.broadcastMessage = broadcastMessage
