---
title: MATLAB eqFactors 能谱求解
date: 20260804
category: 代码
summary: 一个用于沿 q 扫描 det(eqFactors)=0，并用 vpasolve 计算 lambda 能谱分支的 MATLAB 模板。
---

# MATLAB eqFactors 能谱求解

这段代码用于沿一维波矢 `q` 扫描符号矩阵 `eqFactors` 的行列式方程，并求解每个 `q` 点对应的 `lambda`。结果矩阵第一列保存 `q`，后续列保存求出的 `lambda` 分支。

相比原始片段，这里预先设置求解分支数，并对每个点的解数量做了兼容处理，避免某些 `q` 点少解或多解时直接报错。

## 代码

```matlab
% Solve det(eqFactors) == 0 along q and collect lambda branches.
%
% Required symbolic variables:
%   k0, k1, k2, q, lambda
%
% Required numeric parameters:
%   k0N, k1N, k2N

Nint = 100;                 % Number of intervals.
numQ = Nint + 1;            % Number of q sample points.
numBranches = 4;            % Expected number of lambda branches.

qValues = linspace(-pi, pi, numQ).';
lambdaValues = nan(numQ, numBranches);

for i = 1:numQ
    qN = qValues(i);

    eqThis = subs(eqFactors, ...
        {k0,  k1,  k2,  q}, ...
        {k0N, k1N, k2N, qN});

    detEq = det(eqThis);
    lambdaThis = double(vpasolve(detEq == 0, lambda));
    lambdaThis = sort(lambdaThis(:), "ascend");

    nFound = min(numel(lambdaThis), numBranches);
    lambdaValues(i, 1:nFound) = lambdaThis(1:nFound).';
end

result = [qValues, lambdaValues];
```

## 参数

- `eqFactors`：符号矩阵。通过 `det(eqFactors) == 0` 构造特征方程。
- `k0, k1, k2, q, lambda`：符号变量。
- `k0N, k1N, k2N`：代入符号变量的数值参数。
- `Nint`：区间划分数量。最终会计算 `Nint + 1` 个 `q` 点。
- `numBranches`：预期保存的 `lambda` 分支数量。

## 返回值或输出

输出变量为 `result`。

`result(:, 1)` 是 `q` 值，`result(:, 2:end)` 是对应的 `lambda` 解。若某个 `q` 点找到的解少于 `numBranches`，缺失位置会保留为 `NaN`。

## 处理流程

1. 生成 `q` 扫描点

   ```matlab
   qValues = linspace(-pi, pi, numQ).';
   ```

   这里包含区间两端点 `-pi` 和 `pi`。

2. 对每个 `q` 点代入参数

   ```matlab
   eqThis = subs(eqFactors, {k0, k1, k2, q}, {k0N, k1N, k2N, qN});
   ```

   每次循环中只保留 `lambda` 作为待求解变量。

3. 构造行列式方程

   ```matlab
   detEq = det(eqThis);
   ```

   能谱条件通常写成 `det(eqFactors) = 0`。

4. 数值求解 `lambda`

   ```matlab
   lambdaThis = double(vpasolve(detEq == 0, lambda));
   ```

   `vpasolve` 求出当前 `q` 点对应的数值解，再转成 double 保存。

5. 整理分支数量

   ```matlab
   nFound = min(numel(lambdaThis), numBranches);
   lambdaValues(i, 1:nFound) = lambdaThis(1:nFound).';
   ```

   这样即使某些点的解数量不完全一致，也能继续计算完整扫描结果。

## 适合使用的场景

- 沿一维波矢扫描能带或特征值。
- 符号矩阵需要先代入参数，再求行列式零点。
- 每个 `q` 点可能有多个 `lambda` 分支。

## 注意事项

- `numBranches` 需要根据实际方程阶数设置。
- `vpasolve` 对初值和方程形式比较敏感。如果出现漏解，可以考虑给 `vpasolve` 加搜索区间。
- 如果解中包含复数，`sort` 会按 MATLAB 的复数排序规则处理；需要实部排序时应改成 `sort(real(lambdaThis))` 或自定义排序。
- 对较大的符号矩阵，循环中反复 `det` 和 `vpasolve` 可能很慢，可以先化简或转成数值函数。

## 示例

```matlab
Nint = 200;
numBranches = 4;
```

这个设置会在 `[-pi, pi]` 上计算 201 个 `q` 点，并保存 4 条 `lambda` 分支。
