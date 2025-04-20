# bchat-backend

## 设计

- 使用的是 Node.js + AWS Lambda + DynamoDB + API Gateway 的无服务器架构
- 使用的是 AWS SAM CLI 进行部署
- 用户信息和消息队列都存储在 DynamoDB 中
- 你将“游戏房间”设计为一种特殊的带元信息的聊天室
- 总用户量大约在 100 人左右
- WebSocket 实现实时通信

## 表结构

1.  Users 表（用户资料）

| 字段名       | 类型   | 说明                                          |
| ------------ | ------ | --------------------------------------------- |
| userId       | string | 主键，唯一标识                                |
| name         | string | 用户名                                        |
| avatar       | string | 头像的 URL                                    |
| password     | string | 前端总是会发送加盐后的 MD5 哈希, 后端无需处理 |
| connectionId | string | 当前绑定的 WebSocket 连接 ID（可为空）        |
| createdAt    | number | 注册时间戳                                    |

2.  Rooms 表（聊天/游戏房间）

| 字段名    | 类型     | 说明                          |
| --------- | -------- | ----------------------------- |
| roomId    | string   | 主键，房间唯一 ID             |
| type      | string   | "chat" or "game"              |
| members   | string[] | 用户 ID 数组（或用 Set）      |
| metadata  | map      | 如果是游戏房，存储状态/规则等 |
| updatedAt | number   | 最后活跃时间戳                |

3.  Messages 表（消息记录/游戏指令）

| 字段名    | 类型   | 说明                             |
| --------- | ------ | -------------------------------- |
| roomId    | string | 分区键                           |
| timestamp | number | 排序键（消息顺序）               |
| senderId  | string | 发消息的人                       |
| content   | string | 文本内容/指令/游戏动作           |
| type      | string | 消息类型（text, image, move 等） |
| metadata  | map    | 附加信息，如动作坐标等           |

## 命令行
