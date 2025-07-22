/** @typedef {import('../types.js').Room} Room */

const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(ddbClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE;
const MAX_RETRIES = 3;
const ROOMID_LEN = 4;

module.exports.handler = async (event) => {
  const queryParams = event.queryStringParameters || {};

  const { type } = queryParams;
  if (!type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "type is required" }),
    };
  }

  return await createRoom(type);
};

async function createRoom(type) {
  const createdAt = Math.floor(Date.now() / 1000);
  /** @type {Room} */
  const room = {
    id: "null",
    type,
    stage: 'lobby',
    posLimit: 2,
    members: [],
    body: '',
    createdAt,
    ttl: createdAt + 86400 * 7,
    version: 1
  };

  for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
    room.id = generateRandomBase62String(ROOMID_LEN);

    try {
      await dynamo.send(
        new PutCommand({
          TableName: ROOMS_TABLE,
          Item: room,
          ConditionExpression: "attribute_not_exists(id)",
        })
      );
      return response(200, JSON.stringify(room));
    } catch (error) {
      if (error.code !== "ConditionalCheckFailedException") throw error
    }
  }

  return response(503, {
    message: "Service temporarily unavailable",
    details: "Unable to create room after maximum retries 3",
  });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      'Access-Control-Allow-Methods': 'POST'
    },
    body: body,
  };
}

function generateRandomBase62String(length) {
  const base62Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += base62Chars.charAt(
      Math.floor(Math.random() * base62Chars.length)
    );
  }
  return result;
}
