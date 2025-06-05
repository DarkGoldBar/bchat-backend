/**
 * AWS Lambda WebSocket 事件对象
 * @typedef {Object} WebSocketEvent
 * @property {Object} requestContext - 请求上下文
 * @property {string} requestContext.connectID - 当前连接的唯一标识
 * @property {string} requestContext.domainName - 调用的域名
 * @property {string} requestContext.stage - 所在的部署阶段
 * @property {string} requestContext.routeKey - 路由键
 * @property {string} body - 请求体，通常为 JSON 字符串
 * @property {Object} [headers] - 请求头
 * @property {Object} [multiValueHeaders] - 多值请求头
 * @property {Object} [requestContext.identity] - 请求身份信息
 * @property {string} requestContext.identity.sourceIp - 请求来源 IP 地址
 * @property {string} requestContext.identity.userAgent - 用户代理信息
 * @property {Object} [requestContext.authorizer] - 授权信息
 * @property {string} requestContext.authorizer.principalId - 授权主体的唯一标识
 * @property {Object} [requestContext.authorizer.claims] - 授权主体的声明
 * @property {Object} [requestContext.authorizer.context] - 授权上下文
 * @property {Object} [requestContext.requestId] - 请求 ID
 * @property {Object} [requestContext.resourcePath] - 资源路径
 * @property {Object} [requestContext.stageVariables] - 阶段变量
 * @property {Object} [requestContext.apiId] - API ID
 * @property {Object} [queryStringParameters] - 查询字符串参数
 * @property {Object} [multiValueQueryStringParameters] - 多值查询字符串参数
 * @property {Object} [pathParameters] - 路径参数
 * @property {Object} [stageVariables] - 阶段变量
 * @property {string} [body] - 请求体，通常为 JSON 字符串
 * @property {Object.<string, string>} [queryStringParameters] - 查询字符串参数
 */

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
 * @property {string[]} members - 房间成员对象的json字符串数组。
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
