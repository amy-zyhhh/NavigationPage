# 导航数据维护

主要维护两个文件：

- `links.yaml`：网址卡片数据
- `settings.json`：主题、快捷键和 Bing 搜索配置

## 添加一个网址

在 `links.yaml` 末尾追加一段：

```yaml
- name: 示例网站
  url: https://example.com
  category: 工具
  description: 用一句话描述这个网站，方便搜索匹配。
  tag: 示例
  order: 210
  pinned: false
  icon: example.com
```

## 字段说明

`name`：卡片上显示的网站名称。

`url`：点击后打开的网址。

`category`：所属分组，同名分类会自动归在一起。

`description`：不会显示在卡片上，但会参与搜索。

`tag`：不会显示在卡片上，但会参与搜索。

`order`：排序数字，越小越靠前。

`pinned`：是否出现在置顶区域，`true` 表示置顶；不需要置顶时可以省略。

`icon`：favicon 使用的域名，通常填网站主域名即可。

## 搜索规则

普通输入会搜索本地导航。

输入 `/关键词` 后按回车，会用 Bing 搜索这个关键词。
