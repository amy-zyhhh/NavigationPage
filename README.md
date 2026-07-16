# Navigation Page

一个基于 Astro 的个人导航页，适合部署到 GitHub Pages。

## 功能

- 按分类展示网址卡片
- 支持置顶入口
- 支持本地搜索
- 输入 `/关键词` 后回车可用 Bing 搜索
- 支持深浅色主题切换
- 支持手机端两列布局
- 链接数据使用 YAML 维护

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

本地预览地址通常是：

```text
http://localhost:4321
```

构建静态文件：

```powershell
npm.cmd run build
```

## 添加网址

编辑：

```text
src/data/links.yaml
```

示例：

```yaml
- name: 示例网站
  url: https://example.com
  category: 常用工具
  description: 用于本地搜索的简短说明。
  tag: 示例
  order: 80
  pinned: false
  icon: example.com
```

字段说明：

- `name`：卡片显示名称
- `url`：点击打开的网址
- `category`：分类名称
- `description`：搜索用说明，不直接显示
- `tag`：搜索用标签，不直接显示
- `order`：排序，数字越小越靠前
- `pinned`：是否置顶，`true` 表示显示在置顶区域
- `icon`：favicon 域名；不填或加载失败时显示同色圆点

## 搜索规则

- 普通输入：过滤本地导航
- `/关键词` 后回车：打开 Bing 搜索
- `/`：聚焦搜索框
- `Esc`：清空搜索并取消聚焦
- `t`：切换主题

快捷键和搜索引擎配置在：

```text
src/data/settings.json
```

## 部署到 GitHub Pages

如果仓库名是 `用户名.github.io`，通常不需要额外配置 `base`。

如果仓库名是普通仓库，例如 `NavigationPage`，需要在 `astro.config.mjs` 中配置：

```js
export default defineConfig({
  site: "https://你的用户名.github.io",
  base: "/NavigationPage",
});
```

然后使用 GitHub Actions 或手动将 `dist/` 部署到 GitHub Pages。
