/**
 * AWS Lambda WebSocket 事件对象
 * @typedef {Object} WebSocketEvent
 * @property {Object} requestContext - 请求上下文
 * @property {string} requestContext.connectID - 当前连接的唯一标识
 * @property {string} requestContext.domainName - 调用的域名
 * @property {string} requestContext.stage - 所在的部署阶段
 * @property {string} requestContext.routeKey - 路由键
 * @property {Object} [headers] - 请求头
 * @property {string} [body] - 请求体，通常为 JSON 字符串
 * @property {Object.<string, string>} [queryStringParameters] - 查询字符串参数
 */

/**
 * @typedef {Object} User
 * @property {string} uuid - 用户唯一标识
 * @property {string} name - 用户名
 * @property {Object} avatar - 用户头像
 * @property {string} avatar.icon -
 * @property {string} avatar.text -
 * @property {string} avatar.color -
 * @property {string} avatar.img -
 * @property {string} [connectId] - 连接ID。
 * @property {number} [position] - 房间中的位置。0为观众位，观众位可以重复，其他位置不可重复。不能大于房间的最大位置。
 */

/**
 * @typedef {'lobby' | 'ingame' | 'gameover'} RoomStage
 */

/**
 * @typedef {Object} Room
 * @property {string} id - 房间ID
 * @property {string} type - 房间类型
 * @property {RoomStage} stage - 状态值
 * @property {number} posLimit - 玩家位置上限
 * @property {User[]} members - 房间成员对象。在数据库中时，用json字符串存储。
 * @property {Object} body - 游戏数据
 * @property {number} createdAt - 创建时间
 * @property {number} ttl - 生存时间
 * @property {number} version - 乐观锁版本
 */

export {}
