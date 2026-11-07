import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

// AWS clients are only initialized if AWS credentials / config are present.
// In the 100% free mode, these are completely optional.
export const bedrockClient = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_EXECUTION_ENV
  ? new BedrockRuntimeClient({
      region: process.env.AWS_BEDROCK_REGION || "us-east-1",
      maxAttempts: 3,
      retryMode: "adaptive",
    })
  : null;

export const s3Client = (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_EXECUTION_ENV) && process.env.S3_BUCKET_NAME
  ? new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      maxAttempts: 3,
      retryMode: "adaptive",
    })
  : null;

export const dynamoClient = (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_EXECUTION_ENV) && process.env.DYNAMODB_TABLE_NAME
  ? new DynamoDBClient({
      region: process.env.AWS_REGION || "ap-south-1",
      maxAttempts: 3,
      retryMode: "adaptive",
    })
  : null;
