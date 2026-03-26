# publication

此文件夹用于存放可供下载的文件（PDF 等），目前包含：

- `CV.pdf` — 完整的个人简历 PDF
- `Transcript for Dalian University of Technology.pdf` — 大连理工大学成绩单
- `Transcript for University of Edinburgh.pdf` — 爱丁堡大学成绩单
- `math and coding background.pdf` — 数学与编程背景说明

---

## 网站整体结构

```
xudongwu-0.github.io/
├── _config.yml          # 站点全局配置（姓名、邮箱、头像路径等）
├── index.html           # 首页（个人简介、联系方式、新闻、研究兴趣）
├── cv.html              # CV 页面（教育经历、学术背景、荣誉奖项）
├── research.html        # 研究/论文页面
├── projects.html        # 项目展示页面
├── blog.html            # 博客列表页
├── _layouts/            # 页面模板
│   ├── default.html     # 通用布局
│   └── post.html        # 博客文章布局
├── _includes/           # 可复用的页面片段
│   ├── nav.html         # 导航栏
│   └── footer.html      # 页脚
├── _posts/              # 博客文章（Markdown）
├── assets/
│   ├── css/main.css     # 全局样式
│   └── js/main.js       # 全局脚本
├── images/              # 图片资源
│   ├── wuxudong.jpg     # 个人头像
│   ├── wuxudong.ico     # 网站 favicon
│   ├── bg.png           # 背景图
│   ├── HKU.jpg          # 香港大学 logo
│   ├── edinburgh.png    # 爱丁堡大学 logo
│   ├── DUT.jpg          # 大连理工大学 logo
│   ├── UCI.jpg / UCI.png# UCI logo
│   ├── cv2.png          # 其他图片
│   └── Transcript.png   # 成绩单截图
└── files/               # 可下载文件（本文件夹）
    ├── CV.pdf
    └── ...
```

---

## 照片和 CV 文件放在哪里？

| 文件类型 | 存放路径 | 在哪里被引用 |
|---------|---------|------------|
| **个人头像** | `images/wuxudong.jpg` | `_config.yml` → `author.photo`，以及 `index.html` 的 hero 区域 |
| **学校 logo** | `images/HKU.jpg`、`images/edinburgh.png`、`images/DUT.jpg` 等 | `cv.html` 教育经历时间线，`index.html` affiliations 区域 |
| **CV PDF 文件** | `files/CV.pdf` | `index.html` 首页下载按钮，`cv.html` 页面顶部下载链接 |
| **网站 favicon** | `images/wuxudong.ico` | `_layouts/default.html` |

---

## 如何修改 CV

### 1. 更新 CV PDF 文件

将新的 CV PDF 文件替换到 `files/CV.pdf`（保持文件名不变），首页和 CV 页面的下载链接会自动指向新文件。

### 2. 修改 CV 页面上显示的内容

编辑 `cv.html`，该文件分为以下几个区域：

#### 教育经历 (Education)
每条教育经历是一个 `timeline-item`，结构如下：
```html
<div class="timeline-item">
  <div class="timeline-dot"></div>
  <div class="timeline-content">
    <div class="timeline-header">
      <img src="images/学校logo.jpg" alt="学校名" class="timeline-logo">
      <div>
        <div class="timeline-date">起止时间</div>
        <h3 class="timeline-title">学校名称</h3>
      </div>
    </div>
    <p class="timeline-subtitle">学位 / 专业</p>
    <div class="timeline-details">
      <p>附加信息</p>
      <ul>
        <li>导师信息等</li>
      </ul>
    </div>
  </div>
</div>
```

**添加新教育经历：** 复制上面模板，修改内容后粘贴到 `<div class="timeline">` 内部对应位置。

**添加学校 logo：** 将学校 logo 图片放入 `images/` 文件夹，然后在 `<img src="images/xxx.jpg">` 中引用。

#### 学术背景 (Academic Background)
在 `skills-grid` 区域中，每个 `skill-category` 是一个类别：
```html
<div class="skill-category">
  <h4 class="skill-category-title">类别名称</h4>
  <ul class="skill-list">
    <li>技能 1</li>
    <li>技能 2</li>
  </ul>
</div>
```

#### 荣誉奖项 (Honors & Awards)
每个奖项是一个 `award-item`：
```html
<div class="award-item">
  <div>
    <span class="award-name">奖项名称</span>
    <span class="award-org"> — 颁发机构</span>
  </div>
  <span class="news-date">年份</span>
</div>
```

---

## 如何修改个人信息

编辑 `_config.yml` 中的 `author` 部分：

```yaml
author:
  name: Xudong Wu           # 英文名
  name_cn: 吴煦东             # 中文名
  email_academic: wu.xudong@connect.hku.hk
  email_personal: xudongwu02@gmail.com
  position: Ph.D. Student    # 职位
  university: The University of Hong Kong
  photo: images/wuxudong.jpg # 头像路径
  github: xudongwu-0         # GitHub 用户名
  google_scholar: ""          # Google Scholar ID
  linkedin: ""                # LinkedIn
```

> ⚠️ 修改 `_config.yml` 后，本地预览需要**重启 Jekyll 服务**才能生效。

---

## 如何更换个人头像

1. 将新头像放入 `images/` 文件夹
2. 在 `_config.yml` 中更新 `author.photo` 的路径
3. 同时检查 `index.html` 中 `<img src="images/wuxudong.jpg">` 是否也需要更新

---

## 如何本地预览

```bash
# 安装依赖（首次）
bundle install

# 启动本地服务
bundle exec jekyll serve

# 访问 http://localhost:4000
```

---

## 如何发布

将修改推送到 GitHub 的 `main` 分支，GitHub Pages 会自动构建和部署：

```bash
git add .
git commit -m "更新 CV"
git push origin main
```