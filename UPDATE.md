# ✅ 更新完成！現在支援兩種模式

## 🎯 你現在可以這樣用

### 方案 1: 只用 API Key（推薦先試試）

**只需要兩個設定：**
```env
BLOGGER_BLOG_ID=7881979296888192808
GOOGLE_API_KEY=AIzaSyAr7p6b-9d2URdaEOYVMs2jNdh0BT3xZRE
GEMINI_API_KEY=你的_Gemini_Key
```

**可以做：**
- ✅ 分析現有標籤統計
- ✅ AI 生成建議標籤
- ✅ 預覽標籤效果
- ✅ 儲存結果到 JSON

**不能做：**
- ❌ 批量更新標籤到 Blogger

### 方案 2: 完整功能（需要 OAuth）

**額外設定：**
```env
GOOGLE_CLIENT_ID=你的_Client_ID
GOOGLE_CLIENT_SECRET=你的_Client_Secret
```

**可以做：**
- ✅ 上面所有功能
- ✅ **批量更新標籤到 Blogger**

---

## 🚀 快速開始

### 步驟 1: 安裝
```bash
npm install
```

### 步驟 2: 設定 .env
```bash
cp .env.example .env
```

編輯 `.env`，填入：
- `BLOGGER_BLOG_ID` - 你的 Blog ID
- `GOOGLE_API_KEY` - Google API Key
- `GEMINI_API_KEY` - Gemini API Key

### 步驟 3: 執行
```bash
npm start
```

---

## 💡 建議流程

1. **先用唯讀模式試試看**
   - 只設定 API Key
   - 執行「分析現有標籤」
   - 執行「生成新標籤」看效果

2. **確認滿意後，設定 OAuth**
   - 加入 Client ID 和 Secret
   - 重新執行程式
   - 完成授權後即可批量更新

---

## 📝 取得 API Key 的方法

### 1. Google API Key
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Library → 啟用 "Blogger API v3"
3. APIs & Services → Credentials → Create API Key

### 2. Gemini API Key
1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API Key
3. 複製金鑰

### 3. Blog ID
1. 登入 Blogger
2. 進入部落格後台
3. 網址列：`blogger.com/blog/posts/[這串數字]`

---

## ❓ 常見問題

**Q: 我只想看看 AI 會建議什麼標籤，需要 OAuth 嗎？**
A: 不需要！只要 API Key 就可以預覽。

**Q: 何時需要設定 OAuth？**
A: 只有要「真的更新標籤」時才需要。

**Q: 更新會覆蓋原本的標籤嗎？**
A: 是的，會用新標籤完全取代舊標籤。建議先預覽確認。

**Q: 有測試模式嗎？**
A: 有！預設 `DRY_RUN=true`，不會真的更新，只會預覽。

---

詳細說明請參考：
- `QUICKSTART.md` - 超簡化開始指南
- `README.md` - 完整文件
