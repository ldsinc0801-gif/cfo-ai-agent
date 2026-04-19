/**
 * Gemini on Vertex AI 認証テスト
 * 実行: npx tsx scripts/test-gemini-auth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GEMINI_REGION || 'asia-northeast1';
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log('=== Gemini on Vertex AI 認証テスト ===');
  console.log('Project:', project);
  console.log('Region:', location);
  console.log('Model:', model);

  if (!project) { console.error('ERROR: GOOGLE_CLOUD_PROJECT 未設定'); process.exit(1); }

  try {
    const ai = new GoogleGenAI({ vertexai: true, project, location });

    console.log('\nリクエスト送信中...');
    const response = await ai.models.generateContent({
      model,
      contents: 'こんにちは。「Gemini認証成功」と一言だけ返してください。',
    });

    console.log('レスポンス:', response.text?.trim());
    console.log('\n✅ Gemini 認証テスト成功！');
  } catch (error: any) {
    console.error('\n❌ Gemini 認証テスト失敗');
    console.error('エラー:', error.message?.substring(0, 500));
    if (error.message?.includes('404')) {
      console.error('→ Vertex AI API が未有効化、またはモデルIDが不正です');
    } else if (error.message?.includes('403') || error.message?.includes('PERMISSION')) {
      console.error('→ IAMロール不足: roles/aiplatform.user を付与してください');
    }
    process.exit(1);
  }
}

main();
