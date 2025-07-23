const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb')

const ddbClient = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(ddbClient)

module.exports.dynamo = dynamo