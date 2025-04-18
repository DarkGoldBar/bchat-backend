# bchat-backend

## 设计

- 使用 NodeJS 语言，部分后端业务逻辑可以与前端通用
- 主要架构 Lambda + GateWay + DynamDB
- 实时通信：WebSocket（API Gateway + Lambda）
- 完全使用 AWS 云服务作为后端，选用 AWS SAM 作为框架
- 预想用户量小于 100，不使用消息队列
- “一局游戏” 被抽象为一个特殊类型的房间（type=game），以消息流方式存储操作
- 用户仅允许存在一个 WebSocket 连接

## 表结构

1.  Users 表（用户资料）

| 字段名       | 类型   | 说明                                   |
| ------------ | ------ | -------------------------------------- |
| userId       | string | 主键，唯一标识                         |
| name         | string | 用户名                                 |
| avatar       | string | 头像 URL                               |
| password     | string | 加盐后的 MD5 哈希                      |
| connectionId | string | 当前绑定的 WebSocket 连接 ID（可为空） |
| status       | string | 状态（online / offline）               |
| createdAt    | number | 注册时间戳                             |

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
