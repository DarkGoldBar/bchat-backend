class User {
  /**
   * 创建用户
   * @param {Object} options - 用户配置
   * @param {string} options.uuid - 用户唯一标识
   * @param {string} options.name - 用户名
   * @param {string} options.avatar - 用户头像
   * @param {string?} options.connectionID - 连接ID
   * @param {number?} options.position - 房间中的位置
   */
  constructor(options) {
    /** @type {string} 用户唯一标识 */
    this.uuid = options.uuid;

    /** @type {string} 用户名 */
    this.name = options.name;

    /** @type {string} 用户头像 */
    this.avatar = options.avatar;

    /** @type {string} 连接ID */
    this.connectionID = options.connectionID;

    /** @type {number} 连接ID */
    this.position = options.position;
  }

  /**
   * @returns {Object} 用户信息
   */
  getUserInfo() {
    return {
      uuid: this.uuid,
      name: this.name,
      avatar: this.avatar,
      connectionID: this.connectionID,
      position: this.position
    };
  }

  /** 
   * @returns {string} JSON
  */
  toJson() {
    return JSON.stringify(this.getUserInfo())
  }
}

class Room {
  /**
   * 创建房间
   * @param {Object} options - 房间配置
   * @param {string} options.id - 房间ID
   * @param {string} options.type - 房间类型
   * @param {User[]} options.members - 房间成员
   * @param {string} options.lastState - 最后状态
   * @param {Object} options.metadata - 元数据
   * @param {number} options.updatedAt - 更新时间
   * @param {number} options.ttl - 生存时间
   */
  constructor(options) {
    /** @type {string} 房间ID */
    this.id = options.id;

    /** @type {string} 房间类型 */
    this.type = options.type;

    /** @type {User[]} 房间成员 */
    this.members = options.members || [];

    /** @type {string} 最后状态 */
    this.lastState = options.lastState;

    /** @type {Object} 元数据 */
    this.metadata = options.metadata || {};

    /** @type {number} 更新时间 */
    this.updatedAt = options.updatedAt;

    /** @type {number} 生存时间 */
    this.ttl = options.ttl;
  }

  /**
   * 添加成员
   * @param {User} user - 要添加的用户
   */
  addMember(user) {
    if (!(user instanceof User)) {
      throw new Error('Invalid user type');
    }
    this.members.push(user);
  }

  /**
   * 获取房间信息
   * @returns {Object} 房间详细信息
   */
  getRoomInfo() {
    return {
      id: this.id,
      type: this.type,
      members: this.members.map(member => member.getUserInfo()),
      lastState: this.lastState,
      metadata: this.metadata,
      updatedAt: this.updatedAt,
      ttl: this.ttl
    };
  }
}

export default {
  User,
  Room
};
