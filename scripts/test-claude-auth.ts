/**
 * Claude on Vertex AI 認証テスト
 * 実行: npx tsx scripts/test-claude-auth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import AnthropicVertex from '@anthropic-ai/vertex-sdk';

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.CLAUDE_REGION || 'us-east5';
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  console.log('=== Claude on Vertex AI 認証テスト ===');
  console.log('Project:', project);
  console.log('Region:', region);
  console.log('Model:', model);

  if (!project) { console.error('ERROR: GOOGLE_CLOUD_PROJECT 未設定'); process.exit(1); }

  try {
    const client = new AnthropicVertex({
      projectId: project,
      region,
    });

    console.log('\nリクエスト送信中...');
    const response = await client.messages.create({
      model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'こんにちは。「Claude認証成功」と一言だけ返してください。' }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    console.log('レスポンス:', text.trim());
    console.log('使用トークン:', response.usage);
    console.log('\n✅ Claude on Vertex AI 認証テスト成功！');
  } catch (error: any) {
    console.error('\n❌ Claude on Vertex AI 認証テスト失敗');
    console.error('エラー:', error.message?.substring(0, 500));
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      console.error('→ Model Gardenで Claude Sonnet 4.6 が有効化されていない可能性');
      console.error('  GCPコンソール → Vertex AI → Model Garden → Claude → Enable');
    } else if (error.message?.includes('403') || error.message?.includes('PERMISSION')) {
      console.error('→ IAMロール不足: roles/aiplatform.user を付与してください');
    }
    process.exit(1);
  }
}

main();
