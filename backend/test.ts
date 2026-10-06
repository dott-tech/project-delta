import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from current working directory
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('\n--- 🔍 ENV CHECK ---');
if (envResult.error) {
  console.error('❌ Could not load .env file:', envResult.error.message);
} else {
  console.log('✅ Loaded .env successfully!');
}

console.log('AWS_REGION:', process.env.AWS_REGION || '❌ MISSING');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || '❌ MISSING');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ PRESENT' : '❌ MISSING');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ PRESENT' : '❌ MISSING');
console.log('--------------------\n');

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function testPresignedUrl() {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;

  if (!bucketName || !region) {
    console.error('❌ Aborting: AWS_S3_BUCKET_NAME or AWS_REGION is missing in .env!');
    return;
  }

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const fileKey = `test/test-file-${Date.now()}.txt`;

  try {
    console.log(`🔄 Generating Presigned URL for bucket "${bucketName}"...`);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: 'text/plain',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    console.log('✅ Presigned URL created!');

    console.log('🔄 Uploading test file directly to S3...');
    const res = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'S3 Presigned URL test verified!',
    });

    if (res.ok) {
      console.log('\n🎉 SUCCESS! File uploaded directly to AWS S3!');
      console.log(`📄 URL: https://${bucketName}.s3.${region}.amazonaws.com/${fileKey}\n`);
    } else {
      const errText = await res.text();
      console.error(`\n❌ S3 Upload Failed (Status ${res.status}):`, errText);
    }
  } catch (err) {
    console.error('\n❌ Uncaught error during S3 upload:', err);
  }
}

// Execute and handle top-level promise rejections
testPresignedUrl().catch((err) => {
  console.error('❌ Top-level promise rejected:', err);
});