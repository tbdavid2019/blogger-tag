# 超簡化開始指南 🚀

## 第一步：只要兩個設定！

### 1. 取得 API Key
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立專案（或選擇現有專案）
3. 啟用 **Blogger API v3**
   - 左側選單：APIs & Services → Library
   - 搜尋「Blogger API v3」
   - 點擊 Enable
4. 建立 API Key
   - APIs & Services → Credentials
   - Create Credentials → API Key
   - 複製 API Key

### 2. 取得 Gemini API Key（免費）
1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 點擊「Create API Key」
3. 複製 API Key

### 3. 設定環境變數

```bash
# 安裝依賴
npm install

# 建立 .env 檔案
cp .env.example .env
```

編輯 `.env`，**只需要填這些**：

```env
# 你的 Blog ID（從 Blogger 後台網址取得）
BLOGGER_BLOG_ID=7881979296888192808

# Google API Key
GOOGLE_API_KEY=你的_API_Key

# Gemini API Key
GEMINI_API_KEY=你的_Gemini_Key

# 其他保持預設值即可
AI_PROVIDER=gemini
MAX_TAGS_PER_POST=5
MIN_TAG_CONFIDENCE=0.6
BATCH_SIZE=10
DRY_RUN=true
```

### 4. 執行

```bash
npm start
```

## 兩種模式

### 🔍 唯讀模式（只用 API Key）
**可以做：**
- ✅ 分析現有標籤
- ✅ 讓 AI 生成建議標籤
- ✅ 預覽標籤效果
- ✅ 儲存結果到 JSON

**不能做：**
- ❌ 批量更新標籤到 Blogger

### ✍️ 完整模式（需要 OAuth）
**額外可以做：**
- ✅ 批量更新標籤到 Blogger

**需要額外設定：**
```env
GOOGLE_CLIENT_ID=你的_Client_ID
GOOGLE_CLIENT_SECRET=你的_Client_Secret
```

## 建議流程

### 第一次使用（唯讀模式）

1. **只設定 API Key** → 先試試看效果
2. **執行分析** → 了解現有標籤狀況
3. **生成建議標籤** → 看 AI 建議的品質
4. **檢查結果** → 確認是否滿意

### 確認效果後（完整模式）

5. **設定 OAuth** → 如果要批量更新
6. **設定 DRY_RUN=false** → 真的執行更新
7. **批量更新** → 一鍵更新所有標籤

## 常見問題

### Q: 一定要設定 OAuth 嗎？
**A: 不用！** 如果只想看 AI 建議什麼標籤，只要 API Key 就夠了。

### Q: 何時需要 OAuth？
**A:** 只有當你要「真的更新標籤到 Blogger」時才需要。

### Q: 如何取得 Blog ID？
**A:** 
1. 登入 [Blogger](https://www.blogger.com/)
2. 進入你的部落格管理後台
3. 看網址：`blogger.com/blog/posts/[這串數字]`
4. 那串數字就是 Blog ID

### Q: Gemini API 要錢嗎？
**A:** 免費版每分鐘 60 次請求，對個人部落格已經夠用！

## 範例輸出

```
===== Blogger 標籤整理工具 =====

✓ 成功連線到部落格: David 的技術筆記
  部落格 URL: https://david888.com
  總文章數: 128
  模式: 唯讀模式（只能分析和預覽）

請選擇操作:
❯ 📊 分析現有標籤
  🤖 生成新標籤 (預覽)
  🔍 查看上次結果
  ❌ 離開
```

就這麼簡單！🎉
