---
title: MATLAB 散点插值三维曲面
date: 20260804
category: 代码
summary: 一个用于把散点数据插值到规则网格，并绘制三维曲面的 MATLAB 模板。
---

# MATLAB 散点插值三维曲面

这段代码用于把散点形式的 `x-y-z` 数据转换成规则网格上的曲面。它适合处理 `result` 这类矩阵：第 1 列是 `x`，第 2 列是 `y`，后面的列是不同物理量或不同分支的 `z` 值。

相比原始片段，这里把要绘制的 `z` 列、网格密度和插值方式单独列出来，方便以后复用。

## 代码

```matlab
% 从散点数据插值并绘制三维曲面。
% result(:, 1)：x 坐标数据
% result(:, 2)：y 坐标数据
% result(:, zColumns)：需要绘制的 z 数据列

zColumns = 3:4;
gridSize = 100;
interpMethod = "linear";

xData = result(:, 1);
yData = result(:, 2);

xLine = linspace(min(xData), max(xData), gridSize);
yLine = linspace(min(yData), max(yData), gridSize);
[xGrid, yGrid] = meshgrid(xLine, yLine);

figure("Position", [100, 100, 450, 300]);
ax = axes;
hold(ax, "on");

surfaceHandles = gobjects(1, numel(zColumns));

for i = 1:numel(zColumns)
    zData = result(:, zColumns(i));
    zGrid = griddata(xData, yData, zData, xGrid, yGrid, interpMethod);

    surfaceHandles(i) = surf(ax, xGrid, yGrid, zGrid, ...
        "EdgeColor", "none", ...
        "FaceAlpha", 0.86, ...
        "DisplayName", "surface " + i);
end

shading(ax, "interp");
axis(ax, "tight");
view(ax, 3);
grid(ax, "on");
box(ax, "on");
colorbar(ax);

set(ax, "FontName", "Times New Roman", "FontSize", 14);

title(ax, "$\lambda-\mathbf{q}$", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

xlabel(ax, "$q_x$", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

ylabel(ax, "$q_y$", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");

zlabel(ax, "$\lambda$", ...
    "FontName", "Times New Roman", ...
    "FontSize", 16, ...
    "Interpreter", "latex");
```

## 参数

- `result`：散点数据矩阵。第 1 列为 `x`，第 2 列为 `y`。
- `zColumns`：需要绘制为曲面的列号，例如 `3:4` 表示绘制第 3、4 列。
- `gridSize`：插值网格密度。数值越大，曲面越细，但计算也更慢。
- `interpMethod`：插值方法，例如 `"linear"`、`"nearest"` 或 `"natural"`。

## 返回值或输出

这段脚本没有显式返回值，运行后会生成一个三维曲面图。

曲面由散点数据通过 `griddata` 插值得到，并显示颜色条。

## 处理流程

1. 提取散点坐标

   ```matlab
   xData = result(:, 1);
   yData = result(:, 2);
   ```

   原始数据通常是不规则散点，不能直接用 `surf` 画曲面。

2. 构造规则网格

   ```matlab
   [xGrid, yGrid] = meshgrid(xLine, yLine);
   ```

   `meshgrid` 生成规则二维网格，作为曲面绘制的基础。

3. 对每个 `z` 分支插值

   ```matlab
   zGrid = griddata(xData, yData, zData, xGrid, yGrid, interpMethod);
   ```

   `griddata` 把散点上的 `z` 值插值到规则网格上。

4. 绘制三维曲面

   ```matlab
   surf(ax, xGrid, yGrid, zGrid, "EdgeColor", "none");
   ```

   关闭边线并使用 `shading interp`，图面会更平滑。

## 适合使用的场景

- 将散点仿真结果画成连续曲面。
- 绘制能带、势能面、响应面或参数扫描结果。
- 同一组 `x-y` 点上有多个 `z` 分支需要叠加展示。

## 注意事项

- `griddata` 在数据凸包外会产生 `NaN`，曲面边缘可能出现空洞。
- 如果散点分布很稀疏，插值曲面可能产生误导，需要结合原始散点检查。
- 多个曲面叠加时，`FaceAlpha` 可以降低遮挡，但也可能让颜色解释变复杂。

## 示例

```matlab
zColumns = 3:6;
gridSize = 120;
interpMethod = "natural";
```

这个设置会把 `result` 的第 3 到第 6 列都绘制为曲面，并使用更细的网格。
