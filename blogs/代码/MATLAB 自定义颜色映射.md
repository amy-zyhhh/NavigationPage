---
title: MATLAB 自定义颜色映射
date: 20260804
category: 代码
summary: 两个 MATLAB 自定义 colormap 模板：双色渐变和多颜色点分段渐变。
---

# MATLAB 自定义颜色映射

这段代码用于创建自定义 `colormap`。第一种是两个颜色之间的线性渐变，第二种是多个颜色点之间的分段线性渐变。

相比原始片段，这里把颜色映射整理成两个函数，后续只需要传入颜色数组即可复用。

## 代码

```matlab
% Example 1: two-color colormap.
colorStart = [102, 178, 225] / 256;
colorEnd = [0.98, 0.98, 0.98];
numColors = 256;

customMap = makeLinearColormap([colorStart; colorEnd], numColors);
colormap(customMap);

% Example 2: multi-point colormap.
colors = [
    102/256, 178/256, 225/256;  % blue
    0.2,     0.8,     0.2;      % green
    1.0,     1.0,     0.0;      % yellow
    1.0,     0.5,     0.0;      % orange
    216/256, 30/256,  90/256    % magenta
];

customMap = makeLinearColormap(colors, numColors);
colormap(customMap);

function customMap = makeLinearColormap(colors, numColors)
% makeLinearColormap creates a linearly interpolated colormap.
%
% colors:
%   n-by-3 RGB color points, with values in [0, 1].
%
% numColors:
%   Number of colors in the final colormap.

    arguments
        colors (:, 3) double
        numColors (1, 1) double {mustBeInteger, mustBePositive} = 256
    end

    if any(colors(:) < 0 | colors(:) > 1)
        error("Color values must be in the range [0, 1].");
    end

    sourcePositions = linspace(1, numColors, size(colors, 1));
    targetPositions = 1:numColors;

    customMap = zeros(numColors, 3);
    for channel = 1:3
        customMap(:, channel) = interp1( ...
            sourcePositions, ...
            colors(:, channel), ...
            targetPositions, ...
            "linear" ...
        ).';
    end
end
```

## 参数

- `colors`：颜色控制点矩阵，每一行是一个 RGB 颜色，取值范围为 `[0, 1]`。
- `numColors`：最终颜色表的颜色数量，常用值为 `256`。
- `customMap`：生成的颜色映射矩阵，可直接传给 `colormap`。

## 返回值或输出

`makeLinearColormap` 返回一个 `numColors` 行、3 列的 RGB 矩阵。

调用 `colormap(customMap)` 后，当前图窗或坐标轴会使用这套颜色映射。

## 处理流程

1. 定义颜色控制点

   ```matlab
   colors = [
       102/256, 178/256, 225/256;
       216/256, 30/256,  90/256
   ];
   ```

   每一行代表一个颜色。颜色点越多，渐变层次越复杂。

2. 定义颜色点位置

   ```matlab
   sourcePositions = linspace(1, numColors, size(colors, 1));
   ```

   颜色控制点会均匀分布在整个 colormap 范围内。

3. 对三个颜色通道分别插值

   ```matlab
   customMap(:, channel) = interp1(...);
   ```

   RGB 三个通道分别线性插值，最后组合成完整颜色表。

## 适合使用的场景

- 给 `surf`、`imagesc`、`contourf` 等图自定义颜色风格。
- 想让图像颜色从浅色到深色平滑过渡。
- 需要在多个图中复用同一套配色。

## 注意事项

- RGB 数值必须在 `[0, 1]` 范围内。
- 如果使用 `[102, 178, 225]` 这种 0 到 255 的颜色，需要除以 255 或 256 后再传入。
- 颜色点默认均匀分布。如果需要非均匀颜色位置，可以扩展函数，额外传入 positions。

## 示例

```matlab
customMap = makeLinearColormap([
    0.1, 0.2, 0.8;
    1.0, 1.0, 1.0;
    0.8, 0.1, 0.2
], 256);

colormap(customMap);
```

这个示例会创建一套从蓝色到白色再到红色的渐变颜色映射。
