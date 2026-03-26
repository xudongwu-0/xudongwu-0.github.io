# xudongwu-0.github.io

Xudong Wu (吴煦东) 的个人学术主页，基于 [Jekyll](https://jekyllrb.com/) 构建，托管在 GitHub Pages 上。

🔗 **在线地址**：[https://xudongwu-0.github.io](https://xudongwu-0.github.io)

---

## 项目结构

```
├── _config.yml          # 站点全局配置（标题、个人信息等）
├── index.html           # 首页（About / News / 研究兴趣）
├── cv.html              # CV 页面
├── research.html        # 研究经历页面
├── projects.html        # 项目展示页面
├── blog.html            # 博客列表页
├── sitemap.xml          # 站点地图
├── _layouts/
│   ├── default.html     # 全局布局模板
│   └── post.html        # 博客文章模板
├── _includes/
│   ├── nav.html         # 导航栏
│   └── footer.html      # 页脚
├── _posts/              # 博客文章（Markdown）
├── assets/
│   ├── css/main.css     # 全局样式
│   └── js/main.js       # 全局脚本
├── images/              # 图片资源（头像、校徽等）
└── files/               # 文件资源（CV PDF、成绩单等）
```

---

## 本地预览

```bash
# 安装依赖
bundle install

# 启动本地服务器
bundle exec jekyll serve
```

浏览器打开 `http://localhost:4000` 即可预览。

---

## 如何更新内容

### 1. 更新 CV

**更新 PDF 文件：**
- 将新的 CV PDF 文件命名为 `CV.pdf`，替换 `files/CV.pdf`

**更新页面内容：**
- 编辑 `cv.html`，页面按以下板块组织：
  - **Education**：教育经历（时间线格式）
  - **Academic Background**：学术背景 / 课程
  - **Skills**：技能标签
  - **Awards**：获奖经历
- 每条教育经历使用 `timeline-item` 结构，包含 logo 图片、时间、学校名、学位、详情
- 添加新条目时，复制已有的 `<div class="timeline-item">...</div>` 块并修改内容即可

### 2. 更新项目 (Projects)

编辑 `projects.html`，每个项目使用一个 `project-card` 卡片：

```html
<div class="project-card">
  <div class="project-card-body">
    <div class="project-card-header">
      <i class="fas fa-icon-name project-icon"></i>  <!-- 选择合适的 FontAwesome 图标 -->
      <h3 class="project-title">
        <a href="https://github.com/..." target="_blank">项目名称</a>
      </h3>
    </div>
    <p class="project-description">项目描述...</p>
    <div class="project-footer">
      <div class="project-tech">
        <span class="tech-tag">Python</span>
        <span class="tech-tag">PyTorch</span>
      </div>
      <a href="https://github.com/..." target="_blank" class="project-link">
        View <i class="fas fa-arrow-right"></i>
      </a>
    </div>
  </div>
</div>
```

将新卡片放到 `<div class="card-grid fade-in">` 内即可。

### 3. 更新照片 / 图片

所有图片存放在 `images/` 目录下：

| 文件 | 用途 |
|------|------|
| `wuxudong.jpg` | 个人头像（首页展示） |
| `wuxudong.ico` | 网站 favicon |
| `HKU.jpg` | 港大校徽 |
| `edinburgh.png` | 爱丁堡大学校徽 |
| `DUT.jpg` | 大连理工校徽 |
| `UCI.png` / `UCI.jpg` | UC Irvine 校徽 |

**更换头像：** 将新照片命名为 `wuxudong.jpg` 放入 `images/` 目录，覆盖原文件。

**添加新 logo：** 将图片放入 `images/` 目录，然后在 HTML 中引用：
```html
<img src="{{ site.baseurl }}/images/新图片.png" alt="描述" class="timeline-logo">
```

### 4. 更新研究经历 (Research)

编辑 `research.html`，每段经历使用 `timeline-item` 结构（与 CV 中的教育经历格式一致）。

### 5. 更新首页信息

编辑 `index.html`：
- **个人简介**：修改 `hero` 区域和 `#about` 区域的文字
- **News**：在 `#news` 区域添加新的 `news-item`：
  ```html
  <div class="news-item">
    <span class="news-date">月份 年份</span>
    <span class="news-content">新闻内容</span>
  </div>
  ```

### 6. 发布博客

在 `_posts/` 目录下创建 Markdown 文件，命名格式为 `YYYY-MM-DD-标题.md`：

```markdown
---
layout: post
title: "文章标题"
date: YYYY-MM-DD
tags: [tag1, tag2]
---

文章正文（支持 Markdown 语法）...
```

### 7. 修改全局配置

编辑 `_config.yml` 可修改：
- 网站标题、描述
- 个人邮箱、GitHub 链接
- Google Scholar、LinkedIn 等社交链接

---

## 部署

推送到 `main` 分支即可自动部署到 GitHub Pages：

```bash
git add .
git commit -m "描述本次更新"
git push origin main
```

通常 1-2 分钟后更新生效，可在仓库 Settings → Pages 查看部署状态。

---

## 技术栈

- **静态网站生成器**：Jekyll
- **托管**：GitHub Pages
- **样式**：自定义 CSS + Font Awesome 图标
- **字体**：Inter + Playfair Display (Google Fonts)
- **主题**：支持亮色 / 暗色模式切换
