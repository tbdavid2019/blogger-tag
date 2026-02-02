import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

class TagGenerator {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'gemini';
    this.maxTags = parseInt(process.env.MAX_TAGS_PER_POST) || 5;
    this.minConfidence = parseFloat(process.env.MIN_TAG_CONFIDENCE) || 0.6;

    if (this.provider === 'gemini') {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // 使用環境變數設定模型，預設改為更穩定且快速的 gemini-1.5-flash
      const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      this.model = this.genAI.getGenerativeModel({ model: modelName });
    }
  }

  /**
   * 從文章內容生成標籤
   */
  async generateTags(post) {
    const content = this.extractContent(post);
    
    if (!content || content.length < 50) {
      return { tags: [], confidence: 0, reason: 'Content too short' };
    }

    try {
      if (this.provider === 'gemini') {
        return await this.generateTagsWithGemini(post.title, content);
      } else if (this.provider === 'openai') {
        return await this.generateTagsWithOpenAI(post.title, content);
      }
    } catch (error) {
      console.error('Error generating tags:', error.message);
      return { tags: [], confidence: 0, reason: error.message };
    }
  }

  /**
   * 使用 Gemini 生成標籤
   */
  async generateTagsWithGemini(title, content) {
    const prompt = `
請分析以下繁體中文部落格文章，並生成最多 ${this.maxTags} 個最相關的標籤。

文章標題：${title}

文章內容：
${content.substring(0, 3000)}

要求：
1. 標籤必須是繁體中文
2. 標籤應該簡短（1-4個字）且精準
3. 標籤應涵蓋文章的主要主題、技術、領域
4. 避免過於通用的標籤（如「文章」、「分享」）
5. 優先考慮技術性、專業性標籤

請以 JSON 格式回覆，格式如下：
{
  "tags": ["標籤1", "標籤2", "標籤3"],
  "confidence": 0.95,
  "reasoning": "簡短說明為何選擇這些標籤"
}
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 解析 JSON 回應
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        tags: parsed.tags.slice(0, this.maxTags),
        confidence: parsed.confidence || 0.8,
        reasoning: parsed.reasoning || '',
      };
    }

    return { tags: [], confidence: 0, reason: 'Failed to parse AI response' };
  }

  /**
   * 使用 OpenAI 生成標籤（備選方案）
   */
  async generateTagsWithOpenAI(title, content) {
    // 預留給 OpenAI 整合
    throw new Error('OpenAI provider not implemented yet');
  }

  /**
   * 從文章中提取純文字內容
   */
  extractContent(post) {
    let content = post.content || '';
    
    // 移除 HTML 標籤
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<[^>]+>/g, ' ');
    
    // 解碼 HTML 實體
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/&lt;/g, '<');
    content = content.replace(/&gt;/g, '>');
    content = content.replace(/&amp;/g, '&');
    content = content.replace(/&quot;/g, '"');
    
    // 清理多餘空白
    content = content.replace(/\s+/g, ' ').trim();
    
    return content;
  }

  /**
   * 分析現有標籤並建議改進
   */
  async analyzeExistingTags(posts) {
    const tagStats = {};
    
    posts.forEach(post => {
      if (post.labels) {
        post.labels.forEach(tag => {
          tagStats[tag] = (tagStats[tag] || 0) + 1;
        });
      }
    });

    // 排序標籤
    const sortedTags = Object.entries(tagStats)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalTags: Object.keys(tagStats).length,
      topTags: sortedTags.slice(0, 20),
      rareTags: sortedTags.filter(t => t.count === 1),
      avgTagsPerPost: posts.reduce((sum, p) => sum + (p.labels?.length || 0), 0) / posts.length,
    };
  }

  /**
   * 批量生成標籤（帶進度顯示）
   */
  async batchGenerateTags(posts, progressCallback) {
    const results = [];
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      
      if (progressCallback) {
        progressCallback(i + 1, posts.length, post.title);
      }

      const tagResult = await this.generateTags(post);
      
      results.push({
        postId: post.id,
        title: post.title,
        url: post.url,
        oldTags: post.labels || [],
        newTags: tagResult.tags,
        confidence: tagResult.confidence,
        reasoning: tagResult.reasoning,
        shouldUpdate: tagResult.confidence >= this.minConfidence,
      });

      // 避免 API rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }
}

export default TagGenerator;
