/** @typedef {import('../types.js').Room} Room */
/** @typedef {import('../types.js').User} User */

/** @typedef {Object} Cell
 * @property {'' | 'A' | 'B'} value
 * @property {number} row
 * @property {number} col
 */

const { broadcastMessage } = require('./ifApiGateway')
const { dynamo } = require('./ifDynamoDB')
const ROOMS_TABLE = process.env.ROOMS_TABLE

/**
 * @param {string} subAction
 * @param {Room} room
 * @param {User} user
 * @param {object?} context
 * @returns
 */
module.exports.wuziqiHandler = async (subAction, room, user, context) => {
  if (subAction === 'join') {
    return await handleJoin(room, user)
  }
  if (subAction === 'leave') {
    return await handleLeave(room, user)
  }
  if (subAction === 'startGame') {
    return await handleStartGame(room)
  }
  if (subAction === 'doMove') {
    return await handleDoMove(room, user, context)
  }
  throw new Error(`Invalid subAction: ${subAction}`)
}

/**
 * @param {Room} room
 */
async function handleStartGame(room) {
  // 校验
  const cols = 11
  const rows = 11
  const posLimit = room.posLimit
  const isReady = room.members.filter(m => m.position > 0).length === posLimit
  const currentPlayerId = room.members.find(m => m.position === 1)?.uuid
  if (!isReady || !currentPlayerId) {
    throw new Error(`Not enough players ready to start the game`)
  }
  // 逻辑
  room.stage = 'ingame'
  room.body = {
    board: Array.from({ length: rows * cols }).map((_, index) => ({
      value: '',
      row: Math.floor(index / cols),
      col: index % cols,
    })),
    currentPlayerId: currentPlayerId,
    winner: null,
    undoArgs: null,
  }
  // 更新数据库
  await dynamo.send(
    new UpdateCommand({
      TableName: ROOMS_TABLE,
      Key: { id: room.id },
      ConditionExpression: '#version = :ver',
      UpdateExpression: `SET #state = :state, #body = :body, #version = :newVer`,
      ExpressionAttributeNames: {
        '#state': 'state',
        '#body': 'body',
        '#version': 'version',
      },
      ExpressionAttributeValues: {
        ':state': 'ingame',
        ':body': JSON.stringify(room.body),
        ':ver': room.version,
        ':newVer': room.version + 1,
      },
      ReturnValues: 'NONE',
    })
  )
  // 广播更新
  await broadcastMessage(room, {
    action: 'init',
    room: room,
  })
}

/**
 * @param {string} subAction
 * @param {Room} room
 * @param {User} user
 * @param {object} context
 * @param {number} context.row
 * @param {number} context.col
 */
async function handleDoMove(room, user, context) {
  if (!isReady || !user || !context || !context.row || !context.col) {
    throw new Error(`Invalid parameters for doMove`)
  }
  // 校验
  if (room.body.winner) {
    throw new Error(`Game is already over`)
  }
  if (room.body.currentPlayerId !== user.uuid) {
    throw new Error(`It's not your turn`)
  }
  const userPosition = room.members.find(m => m.uuid === user.uuid)?.position
  const value = userPosition ?? 0
}