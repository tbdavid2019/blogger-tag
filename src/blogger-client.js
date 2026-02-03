import { google } from 'googleapis';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

class BloggerClient {
  constructor() {
    this.blogId = process.env.BLOGGER_BLOG_ID;
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.tokenPath = join(__dirname, '..', 'token.json');
    
    // 判斷使用模式：只有 API Key（唯讀）或 OAuth（可寫入）
    this.readOnlyMode = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;
    
    if (this.readOnlyMode) {
      // 唯讀模式：只用 API Key
      this.blogger = google.blogger({ 
        version: 'v3', 
        auth: this.apiKey 
      });
    } else {
      // 完整模式：使用 OAuth（可讀寫）
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      // 載入已存在的 token
      if (existsSync(this.tokenPath)) {
        const token = JSON.parse(readFileSync(this.tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(token);
      }

      this.blogger = google.blogger({ version: 'v3', auth: this.oauth2Client });
    }
  }

  /**
   * 取得 OAuth 授權 URL
   */
  getAuthUrl() {
    if (this.readOnlyMode) {
      throw new Error('唯讀模式不需要 OAuth 授權');
    }
    const scopes = ['https://www.googleapis.com/auth/blogger'];
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  /**
   * 使用授權碼取得 token
   */
  async getToken(code) {
    if (this.readOnlyMode) {
      throw new Error('唯讀模式不需要 OAuth 授權');
    }
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    writeFileSync(this.tokenPath, JSON.stringify(tokens));
    return tokens;
  }

  /**
   * 取得所有文章
   */
  async getAllPosts() {
    try {
      const posts = [];
      let pageToken = undefined;

      do {
        const params = {
          blogId: this.blogId,
          maxResults: 100, // 降低每頁數量以避免逾時或 payload 過大
          fetchBodies: true,
          fetchImages: false,
        };

        if (pageToken) {
          params.pageToken = pageToken;
        }

        const response = await this.blogger.posts.list(params);

        if (response.data.items) {
          posts.push(...response.data.items);
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      return posts;
    } catch (error) {
      console.error('Error fetching posts:', error.message);
      throw error;
    }
  }

  /**
   * 取得單篇文章
   */
  async getPost(postId) {
    try {
      const response = await this.blogger.posts.get({
        blogId: this.blogId,
        postId: postId,
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching post ${postId}:`, error.message);
      throw error;
    }
  }

  /**
   * 更新文章標籤（需要 OAuth，包含重試機制）
   */
  async updatePostTags(postId, tags, retries = 3) {
    if (this.readOnlyMode) {
      throw new Error('唯讀模式無法更新標籤，請設定 OAuth 憑證');
    }

    for (let i = 0; i <= retries; i++) {
        try {
            const response = await this.blogger.posts.patch({
                blogId: this.blogId,
                postId: postId,
                requestBody: {
                    labels: tags,
                },
            });
            return response.data;
        } catch (error) {
            const isLastAttempt = i === retries;
            
            // 判斷是否為可重試的錯誤
            if (error.code === 403 || error.code === 429 || error.code >= 500) {
                if (!isLastAttempt) {
                    const delay = 1500 * Math.pow(2, i); // 1.5s, 3s, 6s...
                    // 在 console 顯示一點點重試資訊 (不換行以免破壞進度條)
                    // process.stdout.write(chalk.yellow('R')); 
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // 如果是最後一次或是不可重試的錯誤，就拋出
            console.error(`\nError updating post ${postId}:`, error.message);
            throw error;
        }
    }
  }

  /**
   * 批量更新文章標籤
   */
  async batchUpdateTags(updates) {
    if (this.readOnlyMode) {
      throw new Error('唯讀模式無法更新標籤，請設定 OAuth 憑證');
    }
    
    const results = [];
    // 降低 batchSize 以減少 rate limit 風險
    const batchSize = 5; 

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      // 更新時顯示進度
      process.stdout.write(`\r正在更新第 ${i + 1} - ${Math.min(i + batch.length, updates.length)} / ${updates.length} 筆...`);

      const batchResults = await Promise.all(
        batch.map(async ({ postId, tags }) => {
          try {
            if (process.env.DRY_RUN === 'true') {
              return { postId, tags, success: true, dryRun: true };
            }
            await this.updatePostTags(postId, tags);
            return { postId, tags, success: true };
          } catch (error) {
            return { postId, tags, success: false, error: error.message };
          }
        })
      );
      results.push(...batchResults);

      // 每批次後稍微休息
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    process.stdout.write('\n'); // 換行

    return results;
  }

  /**
   * 取得部落格資訊
   */
  async getBlogInfo() {
    try {
      const response = await this.blogger.blogs.get({
        blogId: this.blogId,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching blog info:', error.message);
      throw error;
    }
  }
}

export default BloggerClient;
