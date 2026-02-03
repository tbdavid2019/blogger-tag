import { google } from 'googleapis';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function forceDelete() {
    console.log(chalk.cyan('🔥 啟動強力刪除腳本 (Direct API Mode) 🔥'));

    const blogId = process.env.BLOGGER_BLOG_ID;
    const tokenPath = join(__dirname, '..', 'token.json');

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error(chalk.red('設定錯誤：缺少 OAuth Client ID/Secret'));
        return;
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    // 1. 取得 Access Token
    let accessToken = '';
    try {
        const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));
        oauth2Client.setCredentials(token);
        const { token: refreshedToken } = await oauth2Client.getAccessToken();
        accessToken = refreshedToken;
        console.log(chalk.green('✓ 成功取得 Access Token'));
    } catch (e) {
        console.error(chalk.red('無法讀取 token.json，請先執行 npm start 完成授權'), e);
        return;
    }

    // 2. 搜尋有標籤的文章
    console.log(chalk.yellow('正在掃描殘留標籤 (使用原生 fetch)...'));
    
    // 使用 fetch 直接呼叫，繞過 googleapis 可能的封裝問題
    const listUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?fetchBodies=false&maxResults=50`;
    
    // 簡單的 fetch 封裝
    async function authorizedFetch(url, options = {}) {
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        };
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) {
            throw new Error(`API Error ${res.status}: ${await res.text()}`);
        }
        return res.json();
    }

    let posts = [];
    try {
        let nextPageToken = null;
        let pageCount = 0;
        // 為了展示，只抓前幾頁避免跑太久，因為這只是確認腳本
        do {
            const url = nextPageToken ? `${listUrl}&pageToken=${nextPageToken}` : listUrl;
            const data = await authorizedFetch(url);
            if (data.items) {
                posts.push(...data.items);
            }
            nextPageToken = data.nextPageToken;
            pageCount++;
            process.stdout.write(`\r已掃描 ${posts.length} 篇文章...`);
        } while (nextPageToken && pageCount < 20); // 限制掃描頁數，先抓 1000 篇看看
        console.log('');
    } catch (e) {
        console.error(chalk.red('掃描失敗:'), e.message);
        return;
    }

    const targetPosts = posts.filter(p => p.labels && p.labels.length > 0);
    console.log(chalk.cyan(`發現 ${targetPosts.length} 篇仍有標籤的文章 (僅顯示前掃描的部分)`));

    if (targetPosts.length === 0) {
        console.log(chalk.green('恭喜！目前的掃描範圍內沒有發現標籤。'));
        return;
    }

    console.log(chalk.yellow('正在嘗試用最底層的方式刪除標籤...'));
    
    let success = 0;
    let fail = 0;

    for (const post of targetPosts) {
        const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${post.id}`;
        
        try {
            // 使用 PUT 方法而不是 PATCH，並傳送 labels: []
            // 注意：PUT 需要完整的 resource body，但通常 PATCH 傳送 {"labels": []} 應該要有效。
            // 我們先試試看 fetch PATCH，確保 payload 是 { "labels": [] }
            // 很多 library 會自作聰明把 [] 拿掉，fetch 不會。

            const body = JSON.stringify({
                labels: [] // 明確的空陣列
            });

            await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: body
            });

            success++;
            process.stdout.write(`\r刪除進度: ${success} 成功 / ${fail} 失敗`);
        } catch (e) {
            fail++;
            // ignore
        }
        // 稍微延遲
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(chalk.green(`\n\n執行完畢！ 共處理 ${success} 篇。`));
    console.log(chalk.yellow('請重新整理 Blogger 後台確認是否生效。'));
}

forceDelete();
