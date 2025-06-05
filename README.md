# bchat-backend

## 设计

- 使用的是 Node.js + AWS Lambda + DynamoDB + API Gateway 的无服务器架构
- 使用的是 AWS SAM CLI 进行部署
- 用户信息和消息队列都存储在 DynamoDB 中
- 你将“游戏房间”设计为一种特殊的带元信息的聊天室
- 总用户量大约在 100 人左右
- WebSocket 实现实时通信
- 房间不保存历史消息记录，仅记录最终状况

## 数据库

- DynamoDB 中只存在一个 Room 表。这个表的数据结构与"类型定义"中的`Room`类完全相同。

## 类型定义

```JS
/**
 * @typedef {Object} User
 * @property {string} uuid - 用户唯一标识
 * @property {string} name - 用户名
 * @property {string} avatar - 用户头像
 * @property {string} [connectID] - 连接ID
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
```

## 命令行

- 构建 `sam build`
- 验证 `sam validate`
- 初次发布 `sam deploy -g`
- 测试发布 `sam deploy`
