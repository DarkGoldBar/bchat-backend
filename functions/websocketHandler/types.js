/**
 * @typedef {Object} User
 * @property {string} uuid - 用户唯一标识
 * @property {string} name - 用户名
 * @property {string} avatar - 用户头像
 * @property {string} [connectionID] - 连接ID
 * @property {number} [position] - 房间中的位置
 */

/**
 * @typedef {Object} Room
 * @property {string} id - 房间ID
 * @property {string} type - 房间类型
 * @property {string[]} members - 房间成员
 * @property {string} lastState - 最后状态
 * @property {Object} metadata - 元数据
 * @property {number} createdAt - 创建时间
 * @property {number} ttl - 生存时间
 * @property {number} version - 乐观锁版本
 */

/**
 * @typedef {Object} metadata
 * @property {'WAITING' | 'INGAME' | 'END'} stage - 状态
 * @property {number} memberLimit - 最大人数
 */

export {};
