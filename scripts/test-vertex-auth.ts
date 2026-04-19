/**
 * Vertex AI 認証テストスクリプト（Google Gen AI SDK）
 * 実行: npx tsx scripts/test-vertex-auth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_REGION || 'asia-northeast1';
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  console.log('=== Vertex AI 認証テスト（Google Gen AI SDK） ===');
  console.log('Project:', project);
  console.log('Location:', location);
  console.log('Credentials:', credentials ? '設定済み' : '未設定');

  if (!project) {
    console.error('ERROR: GOOGLE_CLOUD_PROJECT が未設定です');
    process.exit(1);
  }
  if (!credentials) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS が未設定です');
    process.exit(1);
  }

  try {
    // Vertex AI モード（APIキーではなくサービスアカウント認証）
    const ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });

    console.log('\nGemini 2.0 Flash にリクエスト送信中...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'こんにちは、認証テストです。「認証成功」と一言だけ返してください。',
    });

    const text = response.text || '';
    console.log('レスポンス:', text.trim());
    console.log('\n✅ 認証テスト成功！Vertex AI への接続が確認できました。');

  } catch (error: any) {
    console.error('\n❌ 認証テスト失敗');
    console.error('エラー:', error.message);

    if (error.message?.includes('PERMISSION_DENIED')) {
      console.error('\n→ IAMロール不足です。GCPコンソールで以下を確認してください:');
      console.error('  サービスアカウント: cfo-ai-vertex@cfo-ai-493809.iam.gserviceaccount.com');
      console.error('  必要なロール: roles/aiplatform.user');
    } else if (error.message?.includes('credentials')) {
      console.error('\n→ GOOGLE_APPLICATION_CREDENTIALS のパスが正しくありません');
    } else if (error.message?.includes('API_NOT_ENABLED') || error.message?.includes('has not been used')) {
      console.error('\n→ Vertex AI API が有効化されていません');
      console.error('  GCPコンソール → APIs & Services → Vertex AI API を有効化してください');
    }

    process.exit(1);
  }
}

main();
