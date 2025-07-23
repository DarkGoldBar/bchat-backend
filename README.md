# bchat-backend

## 设计

- 使用的是 Node.js + AWS Lambda + DynamoDB + API Gateway 的无服务器架构
- 使用 CommonJS。使用 AWS-SDK v3。
- 使用 AWS SAM CLI 进行部署
- WebSocket 实现实时通信

## 数据库

- DynamoDB 中只存在一个 Room 表。这个表的数据结构与"types.js"中的`Room`类完全相同。
    - Room 表也用来记录 ConnectionID -> RoomID 的映射。用于$disconnect时的逻辑处理。

## 命令行

- 构建 `sam build`
- 验证 `sam validate`
- 初次发布 `sam deploy -g`
- 测试发布 `sam deploy`
