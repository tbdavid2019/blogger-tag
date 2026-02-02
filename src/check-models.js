import dotenv from 'dotenv';
import chalk from 'chalk';
import fetch from 'node-fetch';

dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('錯誤: 找不到 GEMINI_API_KEY'));
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    console.log(chalk.cyan('正在從 Google API 取得最新模型列表...\n'));
    
    // 使用 fetch 直接呼叫 API
    const response = await fetch(url);
    
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    
    if (!data.models) {
        console.log(chalk.yellow('未找到任何模型。'));
        return;
    }

    console.log(chalk.bold('✅ 可用的文字生成模型 (generateContent):'));
    console.log(chalk.gray('----------------------------------------'));
    
    const textModels = data.models.filter(m => 
        m.supportedGenerationMethods.includes('generateContent')
    );

    // 簡單排序：優先顯示較新的版本 (2.5 > 2.0 > 1.5 > 1.0)
    textModels.sort((a, b) => b.name.localeCompare(a.name));

    textModels.forEach(model => {
        // 去掉 'models/' 前綴顯示會比較乾淨
        const modelId = model.name.replace('models/', '');
        const desc = model.description || model.displayName;
        
        // 標記推薦的模型
        let prefix = '  ';
        let suffix = '';
        if (modelId.includes('gemini-2.5-flash') && !modelId.includes('preview')) {
            prefix = chalk.green('⭐ ');
            suffix = chalk.green(' (推薦: 快速穩定)');
        } else if (modelId.includes('gemini-2.5-pro') && !modelId.includes('preview')) {
            prefix = chalk.blue('🧠 ');
            suffix = chalk.blue(' (推薦: 高智商)');
        }

        console.log(`${prefix}${chalk.bold(modelId)}${suffix}`);
        console.log(`     ${chalk.gray(desc)}`);
        console.log(`     Token限制: ${chalk.yellow(model.inputTokenLimit)} in / ${chalk.yellow(model.outputTokenLimit)} out`);
        console.log('');
    });
    
    console.log(chalk.gray('----------------------------------------'));
    console.log(chalk.yellow('\n提示: 請將喜歡的模型 ID 填入 .env 的 GEMINI_MODEL 欄位中'));

  } catch (error) {
    console.error(chalk.red('無法取得模型列表:'), error.message);
  }
}

listModels();
