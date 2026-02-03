import BloggerClient from './blogger-client.js';
import TagGenerator from './tag-generator.js';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BloggerTagOrganizer {
  constructor() {
    this.client = new BloggerClient();
    this.generator = new TagGenerator();
    this.resultsPath = join(__dirname, '..', 'tag-results.json');
  }

  /**
   * 初始化並檢查認證
   */
  async initialize() {
    const spinner = ora('檢查 Blogger API 連線...').start();
    
    try {
      const blogInfo = await this.client.getBlogInfo();
      spinner.succeed(chalk.green(`成功連線到部落格: ${blogInfo.name}`));
      console.log(chalk.gray(`  部落格 URL: ${blogInfo.url}`));
      console.log(chalk.gray(`  總文章數: ${blogInfo.posts.totalItems}`));
      
      // 顯示模式
      if (this.client.readOnlyMode) {
        console.log(chalk.yellow(`  模式: 唯讀模式（只能分析和預覽，無法更新標籤）`));
        console.log(chalk.gray(`  提示: 若要批量更新標籤，請設定 OAuth 憑證`));
      } else {
        console.log(chalk.green(`  模式: 完整模式（可分析、預覽和更新標籤）`));
      }
      
      return true;
    } catch (error) {
      spinner.fail(chalk.red('無法連線到 Blogger API'));
      
      // 唯讀模式下的錯誤處理
      if (this.client.readOnlyMode) {
        console.log(chalk.red('\n錯誤詳情:', error.message));
        console.log(chalk.yellow('\n請檢查：'));
        console.log(chalk.cyan('1. BLOGGER_BLOG_ID 是否正確'));
        console.log(chalk.cyan('2. GOOGLE_API_KEY 是否有效'));
        console.log(chalk.cyan('3. Blogger API v3 是否已在 Google Cloud Console 啟用'));
        console.log(chalk.cyan('4. 部落格是否設為「公開」'));
        throw error;
      }
      
      // 完整模式下的 OAuth 授權
      if (error.message.includes('invalid_grant') || error.message.includes('unauthorized') || error.message.includes('No access, refresh token') || error.message.includes('No access')) {
        console.log(chalk.yellow('\n需要重新授權，請依照以下步驟：'));
        console.log(chalk.cyan('\n1. 前往以下網址授權：'));
        console.log(chalk.blue(this.client.getAuthUrl()));
        console.log(chalk.cyan('\n2. 授權後將獲得授權碼，請貼到下方\n'));
        
        const { inputCode } = await inquirer.prompt([
          {
            type: 'input',
            name: 'inputCode',
            message: '請輸入授權碼 (或是貼上包含 code=... 的完整回傳網址):',
          },
        ]);
        
        let code = inputCode.trim();
        // 自動提取 code：如果使用者貼上的是完整網址
        if (code.includes('code=')) {
          try {
            // 簡單的正則表達式提取 (支援 URL encoded 或 raw 字串)
            const match = code.match(/code=([^&]+)/);
            if (match) {
              code = decodeURIComponent(match[1]);
            }
          } catch (e) {
            console.log(chalk.yellow('無法自動解析 URL，嘗試直接使用輸入值...'));
          }
        }
        
        await this.client.getToken(code);
        return await this.initialize();
      }
      
      throw error;
    }
  }

  /**
   * 分析現有標籤
   */
  async analyzeExistingTags() {
    const spinner = ora('正在分析現有標籤...').start();
    
    const posts = await this.client.getAllPosts();
    const stats = await this.generator.analyzeExistingTags(posts);
    
    spinner.succeed(chalk.green('標籤分析完成'));
    
    console.log(chalk.cyan('\n===== 現有標籤統計 ====='));
    console.log(`總標籤數: ${chalk.yellow(stats.totalTags)}`);
    console.log(`平均每篇文章標籤數: ${chalk.yellow(stats.avgTagsPerPost.toFixed(2))}`);
    console.log(`只使用一次的標籤數: ${chalk.yellow(stats.rareTags.length)}`);
    
    console.log(chalk.cyan('\n前 10 個最常用標籤:'));
    stats.topTags.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${chalk.yellow(item.tag)} - ${item.count} 篇`);
    });
    
    return stats;
  }

  /**
   * 生成新標籤（預覽模式）
   */
  async generateNewTags(limit = null) {
    const spinner = ora('正在獲取文章列表...').start();
    
    let posts = await this.client.getAllPosts();
    spinner.succeed(chalk.green(`找到 ${posts.length} 篇文章`));

    // 問使用者是否要略過已有標籤的文章
    const { skipExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'skipExisting',
        message: '是否跳過「已經有標籤」的文章？(建議選擇 Yes 以節省時間與 API 額度)',
        default: true,
      },
    ]);

    if (skipExisting) {
      const originalCount = posts.length;
      posts = posts.filter(p => !p.labels || p.labels.length === 0);
      const skippedCount = originalCount - posts.length;
      console.log(chalk.blue(`ℹ️  已跳過 ${skippedCount} 篇已有標籤的文章，剩餘 ${posts.length} 篇待處理`));
    }

    if (posts.length > 0) {
      const { limitStr } = await inquirer.prompt([
        {
            type: 'input',
            name: 'limitStr',
            message: `要處理幾篇文章？(留空=全部 ${posts.length} 篇)`,
            default: '',
        },
      ]);
      
      if (limitStr) {
        const limit = parseInt(limitStr);
        if (limit < posts.length) {
          posts = posts.slice(0, limit);
          console.log(chalk.blue(`ℹ️  根據設定，僅處理前 ${limit} 篇文章`));
        }
      }
    }
    
    if (posts.length === 0) {
      console.log(chalk.yellow('沒有需要處理的文章。'));
      return [];
    }

    const { autoApply } = await inquirer.prompt([{
        type: 'confirm',
        name: 'autoApply',
        message: '生成完成後，是否「自動更新」到 Blogger？(選 Yes 會在生成後立即更新，避免資料遺失)',
        default: true
    }]);
    
    console.log(chalk.cyan('\n開始生成標籤...'));
    
    // 定義即時處理的回調函數
    const onResult = async (result) => {
        // 即時保存結果到備份檔案
        const backupPath = this.resultsPath.replace('.json', '_backup.jsonl');
        // 使用 appendFileSync 將單行 JSON 寫入，這樣即使 crash 也能保留前面的結果
        const logEntry = JSON.stringify(result) + '\n';
        // 簡單的 fs append
        try {
             // 這裡不引入 fs appendFileSync，直接假設環境有 (前面有 import { writeFileSync ... } from 'fs')
             // 我們需要動態引入或確保 import 包含 appendFileSync。
             // 為了保險，我們加上 import。但因為這裡不能輕易改 import，我們用簡單的 readFile + writeFile 雖然沒那麼好，但 appendFileSync 是標準 API
             const fs = await import('fs');
             fs.appendFileSync(backupPath, logEntry);
        } catch (e) {
            // ignore fs errors
        }

        // 如果開啟自動更新，且建議更新，就立即更新到 Blogger
        if (autoApply && result.shouldUpdate) {
            try {
                // 不使用 batchUpdate，直接單發更新
                if (process.env.DRY_RUN !== 'true') {
                   await this.client.updatePostTags(result.postId, result.newTags);
                   process.stdout.write(chalk.green(' [已更新]'));
                } else {
                   process.stdout.write(chalk.yellow(' [DryRun]'));
                }
                result.success = true;
            } catch (error) {
                process.stdout.write(chalk.red(` [更新失敗: ${error.message}]`));
                result.success = false;
                result.error = error.message;
            }
        }
    };

    const results = await this.generator.batchGenerateTags(posts, (current, total, title) => {
      process.stdout.write(`\r處理進度: ${current}/${total} - ${title.substring(0, 30)}...`);
    }, onResult);
    
    console.log('\n');
    
    // 儲存完整結果
    writeFileSync(this.resultsPath, JSON.stringify(results, null, 2));
    console.log(chalk.green(`✓ 完整結果已儲存到 ${this.resultsPath}`));
    // 清理這一次的 backup? 先保留比較安全。

    if (autoApply) {
        console.log(chalk.green('\n✨ 所有文章處理完成！'));
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success && r.shouldUpdate).length;
        console.log(`成功更新: ${successCount} 篇`);
        if (failCount > 0) {
            console.log(chalk.red(`更新失敗: ${failCount} 篇`));
        }
        return null;
    }
    
    return results;
  }

  /**
   * 顯示標籤預覽
   */
  displayTagPreview(results, limit = 20) {
    console.log(chalk.cyan(`\n===== 標籤預覽 (前 ${limit} 篇) =====\n`));
    
    const shouldUpdate = results.filter(r => r.shouldUpdate);
    console.log(`建議更新: ${chalk.green(shouldUpdate.length)} 篇`);
    console.log(`信心度不足: ${chalk.yellow(results.length - shouldUpdate.length)} 篇\n`);
    
    results.slice(0, limit).forEach((result, index) => {
      const statusIcon = result.shouldUpdate ? chalk.green('✓') : chalk.yellow('○');
      console.log(`${statusIcon} ${chalk.bold(index + 1)}. ${result.title}`);
      console.log(`   舊標籤: ${chalk.gray(result.oldTags.join(', ') || '(無)')}`);
      console.log(`   新標籤: ${chalk.cyan(result.newTags.join(', '))}`);
      console.log(`   信心度: ${this.getConfidenceColor(result.confidence)}${(result.confidence * 100).toFixed(0)}%${chalk.reset()}`);
      if (result.reasoning) {
        console.log(`   理由: ${chalk.gray(result.reasoning.substring(0, 60))}...`);
      }
      console.log('');
    });
  }

  /**
   * 根據信心度返回顏色
   */
  getConfidenceColor(confidence) {
    if (confidence >= 0.8) return chalk.green;
    if (confidence >= 0.6) return chalk.yellow;
    return chalk.red;
  }

  /**
   * 執行批量更新
   */
  async executeUpdate(inputResults = null, autoConfirm = false) {
    // 檢查是否為唯讀模式
    if (this.client.readOnlyMode) {
      console.log(chalk.red('\n唯讀模式無法更新標籤！'));
      console.log(chalk.yellow('\n若要批量更新標籤，請：'));
      console.log(chalk.cyan('1. 在 .env 中設定 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET'));
      console.log(chalk.cyan('2. 重新執行程式並完成 OAuth 授權'));
      console.log(chalk.gray('\n詳細說明請參考 QUICKSTART.md'));
      return;
    }
    
    let results;
    if (inputResults) {
        results = inputResults;
    } else {
        // 讀取之前的結果
        if (!existsSync(this.resultsPath)) {
            console.log(chalk.red('找不到標籤分析結果，請先執行分析'));
            return;
        }
        results = JSON.parse(readFileSync(this.resultsPath, 'utf-8'));
    }

    const toUpdate = results.filter(r => r.shouldUpdate);
    
    console.log(chalk.cyan(`\n準備更新 ${toUpdate.length} 篇文章的標籤`));
    
    if (!autoConfirm) {
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `確定要更新這 ${toUpdate.length} 篇文章的標籤嗎？`,
                default: false,
            },
        ]);
        
        if (!confirm) {
            console.log(chalk.yellow('已取消更新'));
            return;
        }
    }
    
    const spinner = ora('正在更新標籤...').start();
    
    const updates = toUpdate.map(r => ({
      postId: r.postId,
      tags: r.newTags,
    }));
    
    const updateResults = await this.client.batchUpdateTags(updates);
    
    const successful = updateResults.filter(r => r.success).length;
    const failed = updateResults.filter(r => !r.success).length;
    
    if (failed === 0) {
      spinner.succeed(chalk.green(`✓ 成功更新 ${successful} 篇文章`));
    } else {
      spinner.warn(chalk.yellow(`更新完成: ${successful} 成功, ${failed} 失敗`));
      
      console.log(chalk.red('\n失敗的文章:'));
      updateResults.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.postId}: ${r.error}`);
      });
    }
  }

  /**
   * 移除所有標籤
   */
  async removeAllTags() {
    // 檢查是否為唯讀模式
    if (this.client.readOnlyMode) {
      console.log(chalk.red('\n唯讀模式無法移除標籤！'));
      return;
    }

    console.log(chalk.red('\n⚠️  警告：此操作將會移除所有文章的標籤！無法復原！ ⚠️'));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '確定要移除所有文章的標籤嗎？',
        default: false,
      },
    ]);
    
    if (!confirm) {
        console.log(chalk.yellow('已取消操作'));
        return;
    }

    const { doubleConfirm } = await inquirer.prompt([
        {
          type: 'input',
          name: 'doubleConfirm',
          message: '請輸入 "DELETE" 以確認刪除:',
        },
      ]);

    if (doubleConfirm !== 'DELETE') {
        console.log(chalk.yellow('輸入不正確，已取消操作'));
        return;
    }

    const spinner = ora('正在獲取文章列表...').start();
    const posts = await this.client.getAllPosts();
    spinner.succeed(`找到 ${posts.length} 篇文章`);

    const postsWithTags = posts.filter(p => p.labels && p.labels.length > 0);
    console.log(chalk.cyan(`共有 ${postsWithTags.length} 篇文章有標籤需要移除`));

    if (postsWithTags.length === 0) {
        console.log(chalk.green('沒有需要移除標籤的文章'));
        return;
    }

    const updates = postsWithTags.map(post => ({
        postId: post.id,
        tags: [],
    }));

    const updateSpinner = ora('正在移除標籤...').start();
    const updateResults = await this.client.batchUpdateTags(updates);
    
    const successful = updateResults.filter(r => r.success).length;
    const failed = updateResults.filter(r => !r.success).length;
    
    if (failed === 0) {
        updateSpinner.succeed(chalk.green(`✓ 成功移除 ${successful} 篇文章的標籤`));
    } else {
        updateSpinner.warn(chalk.yellow(`移除完成: ${successful} 成功, ${failed} 失敗`));
        
        console.log(chalk.red('\n失敗的文章:'));
        updateResults.filter(r => !r.success).forEach(r => {
            console.log(`  - ${r.postId}: ${r.error}`);
        });
    }

    // 自動驗證機制
    console.log(chalk.cyan('\n正在自動驗證移除結果...'));
    const verifySpinner = ora('重新讀取文章列表以確認標籤狀態...').start();
    
    try {
        // 稍微等待一下，確保 API 與資料庫同步 (Eventual Consistency)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const freshPosts = await this.client.getAllPosts();
        const stillHasTags = freshPosts.filter(p => p.labels && p.labels.length > 0);
        
        if (stillHasTags.length === 0) {
            verifySpinner.succeed(chalk.green('✨ 驗證成功：所有文章標籤已清空！'));
        } else {
            verifySpinner.warn(chalk.yellow(`⚠️  驗證發現仍有 ${stillHasTags.length} 篇文章有標籤！`));
            console.log(chalk.gray('可能原因：\n1. API 資料尚未寫入完成 (延遲)\n2. 部分請求雖回傳成功但未生效'));
            
            const { retry } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'retry',
                    message: `是否要針對這 ${stillHasTags.length} 篇重新執行移除？`,
                    default: true,
                },
            ]);

            if (retry) {
                console.log(chalk.cyan('\n🔄 正在重新嘗試移除殘留標籤...'));
                const retryUpdates = stillHasTags.map(post => ({
                    postId: post.id,
                    tags: [],
                }));
                // 遞迴呼叫 (這裡只能用 batchUpdateTags，不能遞迴 removeAllTags 因為會重頭來)
                const retryResults = await this.client.batchUpdateTags(retryUpdates);
                const retrySuccess = retryResults.filter(r => r.success).length;
                console.log(chalk.green(`✓ 重試結果: 成功再次處理 ${retrySuccess} 篇`));
            }
        }
    } catch (error) {
        verifySpinner.fail(chalk.red('驗證過程發生錯誤: ' + error.message));
    }
  }

  /**
   * 互動式選單
   */
  async showMenu() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '請選擇操作:',
        choices: [
          { name: '📊 分析現有標籤', value: 'analyze' },
          { name: '🗑️  移除所有標籤 (慎用)', value: 'remove_all' },
          { name: '🤖 生成並自動更新標籤', value: 'generate' },
          { name: '🚀 手動執行批量更新 (從備份)', value: 'update' },
          { name: '🔍 查看上次結果', value: 'view' },
          { name: '❌ 離開', value: 'exit' },
        ],
      },
    ]);
    
    switch (action) {
      case 'analyze':
        await this.analyzeExistingTags();
        break;

      case 'remove_all':
        await this.removeAllTags();
        break;
        
      case 'generate':
        const genResults = await this.generateNewTags();
        if (genResults) {
            this.displayTagPreview(genResults);
        }
        break;
        
      case 'update':
        await this.executeUpdate();
        break;
        
      case 'view':
        if (existsSync(this.resultsPath)) {
          const results = JSON.parse(readFileSync(this.resultsPath, 'utf-8'));
          this.displayTagPreview(results);
        } else {
          console.log(chalk.yellow('尚未執行標籤生成'));
        }
        break;
        
      case 'exit':
        console.log(chalk.cyan('再見！'));
        process.exit(0);
    }
    
    // 繼續顯示選單
    console.log('');
    await this.showMenu();
  }
}

// 主程式
async function main() {
  console.log(chalk.bold.cyan('\n===== Blogger 標籤整理工具 =====\n'));
  
  const organizer = new BloggerTagOrganizer();
  
  try {
    await organizer.initialize();
    await organizer.showMenu();
  } catch (error) {
    console.error(chalk.red('\n發生錯誤:'), error.message);
    process.exit(1);
  }
}

main();
