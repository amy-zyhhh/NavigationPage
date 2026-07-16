# Navigation Page

一个基于 Astro 的个人导航页，用来集中管理常用入口、学术资源和个人项目。当前项目已配置 GitHub Actions，会在推送到 `main` 分支后自动部署到 GitHub Pages。

访问地址：

```text
https://amy-zyhhh.github.io/NavigationPage/
```

## 当前功能

- 按分类展示网址卡片
- 支持置顶入口
- 置顶网址会同时保留在原分类中
- 支持本地搜索
- 输入 `/关键词` 后按回车可用 Bing 搜索
- 支持深色 / 浅色主题切换
- 支持电脑和手机浏览
- 链接数据使用 YAML 维护

## 本地使用

安装依赖：

```powershell
npm.cmd install
```

启动本地预览：

```powershell
npm.cmd run dev
```

本地地址通常是：

```text
http://localhost:4321/NavigationPage/
```

检查能否正常构建：

```powershell
npm.cmd run build
```

## 修改网址

网址数据在：

```text
src/data/links.yaml
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
- `pinned`：是否置顶，`true` 表示显示在置顶区域；置顶后仍会保留在原分类中
- `icon`：favicon 使用的域名；加载失败时会显示同色圆点

## 搜索与快捷键

- 普通输入：过滤本地导航
- `/关键词` 后按回车：打开 Bing 搜索
- `/`：聚焦搜索框
- `Esc`：清空搜索并取消聚焦
- `t`：切换主题

相关配置在：

```text
src/data/settings.json
```

如果要更换搜索引擎，修改 `webSearch.url`，保留 `{query}` 作为搜索关键词占位符。

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

当前配置适用于普通仓库 `NavigationPage`：

```js
export default defineConfig({
  site: "https://amy-zyhhh.github.io",
  base: "/NavigationPage",
});
```

如果以后复制到其他仓库，需要同步修改 `site` 和 `base`。如果仓库名是 `用户名.github.io`，通常不需要配置 `base`。

## 提交更新

修改网址或样式后，建议先本地构建检查：

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
