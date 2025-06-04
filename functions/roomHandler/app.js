import AWS from 'aws-sdk';
import { Room } from './model.js';

const dynamo = new AWS.DynamoDB.DocumentClient();
const ROOMS_TABLE = process.env.ROOMS_TABLE;

const maxRetries = 3;
const roomIdLength = 4;

export const handler = async (event) => {
  const queryParams = event.queryStringParameters || {};

  const { type } = queryParams;

  if (!type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'type is required' })
    };
  }

  return await createRoom(type)
};

async function createRoom(type) {
  /** @type {String?} */
  let id;
  /** @type {Object} */
  let roominfo;

  for (let attempts = 0;attempts < maxRetries; attempts ++ ) {
    id = generateRandomBase62String(roomIdLength);
    roominfo = Room({ id, type} ).getRoomInfo()

    try {
      // 如果房间不存在，则可以创建
      await dynamo.put({
        TableName: ROOMS_TABLE,
        Item: roominfo,
        ConditionExpression: 'attribute_not_exists(id)'
      }).promise();
      return response(200, JSON.stringify(roominfo));

    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        // 如果是因为条件检查失败（即房间已存在）
        continue;
      }
      
      // 其他错误直接抛出
      throw error;
    }
  }

  // 如果重试次数用完仍未成功
  return response(503, {
    message: 'Service temporarily unavailable',
    details: 'Unable to create room after maximum retries 3'
  });
}


function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify(body),
  };
}


function generateRandomBase62String(length) {
  const base62Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += base62Chars.charAt(Math.floor(Math.random() * base62Chars.length));
  }
  return result;
}
