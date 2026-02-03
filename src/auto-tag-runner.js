import BloggerClient from './blogger-client.js';
import TagGenerator from './tag-generator.js';
import { appendFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 強制設定環境變數
process.env.DRY_RUN = 'false'; // 確保一定是真跑

async function autoTagAll() {
    console.log(chalk.bold.cyan('\n===== Blogger 全自動標籤掛載機器人 =====\n'));
    console.log(chalk.yellow('⚠️  注意：此腳本將直接修改您的 Blogger 文章，請確保備份。'));
    console.log(chalk.green('狀態：正在啟動... (DRY_RUN = false)'));

    const client = new BloggerClient();
    const generator = new TagGenerator();
    const logPath = join(__dirname, '..', 'auto-tag-log.jsonl');

    // 1. 取得所有文章
    const spinner = ora('正在下載所有文章列表...').start();
    let posts = [];
    try {
        posts = await client.getAllPosts();
        spinner.succeed(`成功下載 ${posts.length} 篇文章列表`);
    } catch (e) {
        spinner.fail('無法下載文章列表');
        console.error(e);
        return;
    }

    // 2. 讀取已處理記錄 (Resume Logic)
    let processedIds = new Set();
    if (existsSync(logPath)) {
        const lines = readFileSync(logPath, 'utf-8').split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const record = JSON.parse(line);
                if (record.postId) processedIds.add(record.postId);
            } catch (e) {}
        }
        console.log(chalk.blue(`ℹ️  發現已處理記錄：${processedIds.size} 篇 (將會跳過)`));
    }

    // 3. 過濾待處理文章
    // 邏輯：
    // a. 不在庫存紀錄中 (processedIds)
    // b. 且沒有標籤的文章 (client.getAllPosts 回傳的 labels 可能是 undefined 或空陣列)
    // 使用者希望「這四千多篇 blog 貼標」，可能是指全部，也可能是指剩下的。
    // 安全起見，我們先鎖定「沒有標籤」的，避免覆蓋已有人工標籤的。
    // 但如果它是之前生成失敗的，它可能也沒有標籤。
    
    const todoPosts = posts.filter(p => {
        // 如果已經處理過(無論成功失敗)，就跳過
        if (processedIds.has(p.id)) return false;
        
        // 如果已經有標籤，也跳過 (使用者之前的操作可能已經貼上去了)
        // 除非我們想強制覆蓋，但這裡先保守一點，只處理空白的
        if (p.labels && p.labels.length > 0) return false;

        return true;
    });

    console.log(chalk.cyan(`\n待處理文章數：${todoPosts.length} 篇`));
    
    if (todoPosts.length === 0) {
        console.log(chalk.green('🎉 所有文章都已處理完畢！'));
        return;
    }

    // 4. 開始處理 loop
    console.log(chalk.magenta('🚀 開始全自動掛載標籤... (按 Ctrl+C 可隨時暫停，下次會自動續傳)'));

    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < todoPosts.length; i++) {
        const post = todoPosts[i];
        const progress = `[${i + 1}/${todoPosts.length}]`;
        
        // 顯示當前處理
        process.stdout.write(`${chalk.gray(progress)} 分析: ${post.title.substring(0, 30)}... `);

        const startTime = Date.now();
        
        // A. 生成標籤
        const tagResult = await generator.generateTags(post);
        
        // 如果內容被阻擋或無法生成，記錄並跳過
        if (tagResult.tags.length === 0) {
            const errorMsg = tagResult.reason || 'No tags generated';
            console.log(chalk.yellow(`❌ 跳過 (${errorMsg})`));
            
            // 寫入 Log (標記為失敗但已處理，避免無限重試)
            appendLog(logPath, {
                postId: post.id,
                title: post.title,
                status: 'skipped',
                reason: errorMsg,
                timestamp: new Date().toISOString()
            });
            failCount++;
            continue;
        }

        // B. 更新 Blogger
        process.stdout.write(chalk.blue('-> 更新中... '));
        try {
            // 直接呼叫 Client 更新
            await client.updatePostTags(post.id, tagResult.tags);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(chalk.green(`✓ 完成 (${duration}s) [${tagResult.tags.join(', ')}]`));
            
            // 寫入 Log
            appendLog(logPath, {
                postId: post.id,
                title: post.title,
                status: 'success',
                tags: tagResult.tags,
                timestamp: new Date().toISOString()
            });
            successCount++;

        } catch (error) {
            console.log(chalk.red(`❌ 更新失敗: ${error.message}`));
            // 更新失敗不要寫入 Log (或者寫入 status: error)，這樣下次還可以重試
            // 但如果是 404 等永久錯誤，則應該記錄。目前先不記錄，讓它有機會重試。
            failCount++;
        }

        // 避免 API rate limit，稍微休息
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(chalk.bold.green(`\n\n✨ 任務完成！`));
    console.log(`總共成功: ${successCount}`);
    console.log(`總共跳過/失敗: ${failCount}`);
}

function appendLog(path, data) {
    try {
        appendFileSync(path, JSON.stringify(data) + '\n');
    } catch (e) {
        console.error('Log write error:', e);
    }
}

autoTagAll();
