# bchat-backend

## 设计

- 使用的是 Node.js + AWS Lambda + DynamoDB + API Gateway 的无服务器架构
- 使用的是 AWS SAM CLI 进行部署
- 用户信息和消息队列都存储在 DynamoDB 中
- 你将“游戏房间”设计为一种特殊的带元信息的聊天室
- 总用户量大约在 100 人左右
- WebSocket 实现实时通信
- 房间不保存历史消息记录，仅记录最终状况

## 表结构

1.  Rooms 表

| 字段名     | 类型     | 说明                          |
| --------- | -------- | -----------------------------|
| id        | string   | 主键，房间唯一 ID             |
| type      | string   | "chat" or "${gametype}"      |
| members   | string[] | interface User               |
| spectator | string[] | interface User               |
| lastState | string   | 保存最终状态json              |
| metadata  | map      | 如果是游戏房，存储规则等       |
| updatedAt | number   | 最后活跃时间戳                |
| ttl       | number   | TTL                          |


## 数据结构

``` TS
interface User {
    uuid: string
    name: string
    avatar: string
    connectionID: string
}
```

``` TS
interface Room {
    id: string
    type: string
    members: User[]
    lastState: string
    metadata: map
    updatedAt: number
    ttl: number
}
```


## 命令行

- 构建 `sam build`
- 验证 `sam validate`
- 初次发布 `sam deploy -g`
- 测试发布 `sam deploy`
- 正式发布 `sam deploy --parameter-overrides JwtSecret=your_super_secret_value`
