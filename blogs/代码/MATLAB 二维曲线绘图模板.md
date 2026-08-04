---
title: MATLAB 二维曲线绘图模板
date: 20260804
category: 代码
summary: 一个用于绘制二维曲线、设置 Times New Roman 字体和 LaTeX 坐标标签的 MATLAB 绘图模板。
---

# MATLAB 二维曲线绘图模板

这段代码用于把 `vumat` 中的多列数据画成二维曲线。第一列作为横坐标，第二列和第三列作为两条曲线的纵坐标。

相比原始片段，这里把坐标轴、图例、字体和线条样式集中设置，后续只需要替换数据和标签即可复用。

## 代码

```matlab
% Plot two 2D curves from vumat.
% vumat(:, 1): x data
% vumat(:, 2): first y data
% vumat(:, 3): second y data

figure("Position", [100, 100, 450, 300]);
ax = axes;
hold(ax, "on");

curveNames = ["Result data", "Result data 2"];
lineStyles = ["-", "--"];
lineColors = [0, 0, 0; 0.35, 0.35, 0.35];

s = gobjects(1, 2);
for i = 1:2
    s(i) = plot( ...
        ax, ...
        vumat(:, 1), ...
        vumat(:, i + 1), ...
        "LineStyle", lineStyles(i), ...
        "Color", lineColors(i, :), ...
        "LineWidth", 1.2, ...
        "DisplayName", curveNames(i) ...
    );
end

legend(ax, s, "Location", "best", "Interpreter", "latex");
grid(ax, "on");
box(ax, "on");

set(ax, "FontName", "Times New Roman", "FontSize", 14);

title(ax, "$\it{x}$", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

xlabel(ax, "$\it{x}$ / mm", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

ylabel(ax, "$\it{F}$ / N", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

% Optional axis limits.
% xlim(ax, [-1, 20]);
% ylim(ax, [-2, 18]);
```

## 参数

- `vumat`：数值矩阵。第 1 列为横坐标，第 2 列和第 3 列为两条曲线的纵坐标。
- `curveNames`：图例名称。
- `lineStyles`：曲线线型，例如实线 `"-"` 和虚线 `"--"`。
- `lineColors`：曲线颜色，每一行是一个 RGB 三元组。

## 返回值或输出

这段脚本没有显式返回值，运行后会生成一个二维曲线图窗口。

图中包含两条曲线、图例、网格、标题和 LaTeX 格式坐标轴标签。

## 处理流程

1. 创建图窗和坐标轴

   ```matlab
   figure("Position", [100, 100, 450, 300]);
   ax = axes;
   hold(ax, "on");
   ```

   用 `ax` 保存坐标轴句柄，后续所有设置都作用在同一个坐标轴上。

2. 循环绘制曲线

   ```matlab
   for i = 1:2
       s(i) = plot(ax, vumat(:, 1), vumat(:, i + 1));
   end
   ```

   这样以后增加曲线时，只需要扩展 `curveNames`、`lineStyles` 和 `lineColors`。

3. 统一设置图例和字体

   ```matlab
   legend(ax, s, "Location", "best", "Interpreter", "latex");
   set(ax, "FontName", "Times New Roman", "FontSize", 14);
   ```

   图例和坐标轴字体集中设置，避免每次绘图重复修改。

## 适合使用的场景

- 绘制有限元、实验或仿真结果中的二维曲线。
- 需要统一论文图片字体和字号。
- 坐标标签中需要 LaTeX 斜体或数学符号。

## 注意事项

- `vumat` 至少需要 3 列。
- 如果图例中包含中文，可能需要把图例字体单独改成支持中文的字体。
- `legend` 的 `Interpreter` 为 `latex` 时，普通下划线 `_` 会被当成 LaTeX 语法，需要转义或改写。

## 示例

```matlab
plot(vumat(:, 1), vumat(:, 2));
```

实际使用时建议直接使用上面的完整模板，以便保留统一的字体、标签和图例样式。
