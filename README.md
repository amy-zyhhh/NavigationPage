# Navigation Page

一个基于 Astro 的个人导航页，用来集中管理常用入口、学术资源、加密入口和个人博客。项目已配置 GitHub Actions，推送到 `main` 分支后会自动部署到 GitHub Pages。

访问地址：

```text
https://amy-zyhhh.github.io/pages/
```

## 当前功能

- 按分类展示网址卡片
- 支持置顶入口
- 支持首页本地搜索和 Bing 网页搜索
- 支持独立加密导航页
- 加密页可搜索加密导航链接和 blogs 内容
- 支持根目录 `blogs/` 中的 Markdown 博客
- 支持博客分类、日期归档、全文搜索和单篇详情页
- 支持 Markdown 中的相对路径图片
- 支持深色 / 浅色主题切换
- 支持电脑和手机浏览

## 本地使用

安装依赖：

```powershell
npm.cmd install
```

启动本地预览：

```powershell
npx.cmd astro dev --background
```

管理后台开发服务：

```powershell
npx.cmd astro dev status
npx.cmd astro dev stop
npx.cmd astro dev logs
```

本地地址通常是：

```text
http://localhost:4321/pages/
```

检查能否正常构建：

```powershell
npm.cmd run build
```

## 修改网址

普通首页网址数据在：

```text
src/data/links.yaml
```

加密页网址数据在：

```text
src/data/protected-links.yaml
```

新增一个网址时，追加类似内容：

```yaml
- name: 示例网站
  url: https://example.com
  category: 常用工具
  description: 用于搜索匹配的简短说明。
  tag: 示例
  order: 80
  pinned: false
  icon: example.com
```

字段说明：

- `name`：卡片显示的网站名称
- `url`：点击后打开的网址
- `category`：分类名称，同名分类会自动归在一起
- `description`：搜索用说明，不显示在卡片上
- `tag`：搜索用标签，不显示在卡片上
- `order`：排序数字，数字越小越靠前
- `pinned`：是否出现在置顶区域，只用于普通首页
- `icon`：favicon 使用的域名；加载失败时会显示同色圆点
- `target`：打开方式；站内链接可用 `_self`

## 加密导航

首页“其他”分组里的加密入口会提示输入密码。密码正确后会跳转到：

```text
https://amy-zyhhh.github.io/pages/protected/
```

错误 3 次后会临时锁定 5 分钟。加密导航使用浏览器前端校验，适合防止随手打开，不适合保存真正敏感内容。

当前默认密码是：

```text
12345ssdlh
```

建议改成自己的密码。修改方式是把新密码转换成 SHA-256，然后替换：

```text
src/data/settings.json
```

其中 `protectedAccess.passwordHash` 是密码的 SHA-256 值，`maxAttempts` 是允许错误次数，`lockMinutes` 是锁定分钟数。

在 PowerShell 中可以这样生成新密码的 SHA-256：

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('你的密码').digest('hex'))"
```

## 博客维护

博客内容放在项目根目录：

```text
blogs/
```

可以直接在 `blogs/` 下放 `.md` 文件，也可以放进子文件夹。子文件夹只用于个人整理，不会作为网页层级或分类展示；网页会递归收录所有 `.md` 文件。

博客文件格式：

```md
---
title: 示例标题
date: 20260731
category: 示例分类
summary: 一句话摘要，会显示在博客预览里。
---

这里写正文。
```

字段说明：

- `title`：文章标题
- `date`：8 位数字日期，格式为 `YYYYMMDD`
- `category`：网页中的分类入口
- `summary`：博客列表和搜索结果中的摘要

文章地址会根据文件路径生成。例如：

```text
blogs/学者/Prof. Alexander Hartmaier.md
```

会生成：

```text
/pages/blogs/学者/Prof.-Alexander-Hartmaier/
```

### 博客图片

博客详情页使用 Astro 原生 Markdown 渲染，支持 Markdown 和 HTML 图片语法。

推荐写法：

```md
![图片说明](./Prof. Alexander Hartmaier.assets/01.png)
```

也兼容 HTML 写法：

```html
<img src="./Prof. Alexander Hartmaier.assets/01.png" alt="图片说明" style="zoom:33%;" />
```

当前只会读取 HTML 图片里的整体缩放百分比，例如 `style="zoom:33%;"`，并转换成网页可用的图片宽度。复杂的内联样式不会保留。

图片可以放在文章旁边的 `.assets` 文件夹里，例如：

```text
blogs/学者/
  Prof. Alexander Hartmaier.md
  Prof. Alexander Hartmaier.assets/
    01.png
```

建议图片保留 `.png`、`.jpg`、`.jpeg`、`.webp` 等扩展名，便于 Astro 优化和识别。

## 搜索规则

项目使用显式搜索范围，后续新增内容类型不会自动进入任何搜索框，必须在对应页面代码中手动加入。

- 首页：只搜索首页当前导航链接；输入 `/关键词` 后按回车可用 Bing 搜索
- 加密页：搜索加密导航链接和 blogs 内容；链接结果优先显示，blogs 结果显示为博客预览样式
- 博客页：只搜索 blogs 内容，搜索范围包括标题、日期、分类、摘要和正文全文

快捷键：

- `/`：聚焦搜索框
- `Esc`：清空搜索并取消聚焦
- `t`：切换主题

搜索引擎配置在：

```text
src/data/settings.json
```

如果要更换搜索引擎，修改 `webSearch.url`，保留 `{query}` 作为搜索关键词占位符。

## 关键文件

```text
src/pages/index.astro                 普通首页
src/pages/protected.astro             加密导航页
src/pages/blogs/index.astro           博客列表页
src/pages/blogs/[...slug].astro       博客详情页
src/pages/blogs/category/[category].astro  博客分类页
src/components/LinkCard.astro         网址卡片
src/components/BlogPreviewCard.astro  博客预览卡片
src/utils/blogPosts.ts                博客解析和索引
src/utils/searchItems.ts              统一搜索项目转换
src/utils/remarkLooseImages.mjs       博客图片兼容处理
```

## 自动部署

部署流程在：

```text
.github/workflows/deploy.yml
```

每次推送到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages。

当前 Astro 部署配置在：

```text
astro.config.mjs
```

当前配置适用于普通仓库 `pages`：

```js
export default defineConfig({
  site: "https://amy-zyhhh.github.io",
  base: "/pages",
});
```

如果以后复制到其他仓库，需要同步修改 `site` 和 `base`。如果仓库名是 `用户名.github.io`，通常不需要配置 `base`。

## 提交更新

修改网址、博客或样式后，建议先本地构建检查：

```powershell
npm.cmd run build
```

确认无误后提交并推送：

```powershell
git add .
git commit -m "Update navigation page"
git push
```

推送完成后，到 GitHub 的 `Actions` 页面查看部署状态。
