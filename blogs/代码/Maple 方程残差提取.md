---
title: Maple 方程残差提取
date: 20260804
category: 代码
summary: 一个用于从 Maple 方程中提取残差、去除三角因子、分母和公因子的常用过程。
---

## 代码

这段 Maple 过程 `toResidual` 用来把一个方程整理成更适合后续求解、因式分解或人工检查的残差表达式。

它的核心思路是：先把方程左边减右边，得到等价的零点条件；再去掉一些不会改变“等于零”这一条件的外部因子，例如公共三角因子、分母和整体公因子，最后返回一个更短、更干净的表达式。

```maple
toResidual := proc(eq_i, idx)
local e, ec, es, z, trigFactor, den, num, cf, final, userVars;

e := lhs(eq_i) - rhs(eq_i);
e := expand(convert(e, rational));

trigFactor := 1;
ec := simplify(coeff(e, cos(2*theta)));
es := simplify(coeff(e, sin(2*theta)));

if ec <> 0 then
    trigFactor := cos(2*theta);
    z := ec;
elif es <> 0 then
    trigFactor := sin(2*theta);
    z := es;
else
    z := e;
end if;

z := normal(z);
den := denom(z);
num := expand(numer(z));

userVars := indets(num, name) minus {theta};
cf := content(num, userVars);

if cf = 0 then
    cf := 1;
    final := num;
else
    final := simplify(num/cf);
end if;

final := factor(final);

print("equation", idx);
if trigFactor <> 1 then
    print("removed trig factor", trigFactor);
end if;
if den <> 1 then
    print("removed denominator", den);
end if;
if cf <> 1 then
    print("removed common factor", cf);
end if;

return final;
end proc
```

## 参数

- `eq_i`：输入方程，例如 `lhs = rhs` 形式的 Maple equation。
- `idx`：方程编号，只用于打印提示，方便批量处理多个方程时知道当前处理的是哪一个。

## 返回值

返回值是整理后的残差表达式 `final`。

如果原方程等价于 `residual = 0`，那么这个过程会尽量把 `residual` 化成去掉冗余因子的形式。后续可以把返回值继续用于 `solve`、`factor`、`collect` 或者手动检查。

## 处理流程

1. 构造残差

   ```maple
   e := lhs(eq_i) - rhs(eq_i);
   ```

   方程 `lhs = rhs` 被改写成 `lhs - rhs = 0`。这样后续只需要处理一个表达式。

2. 有理化并展开

   ```maple
   e := expand(convert(e, rational));
   ```

   `convert(e, rational)` 会把浮点数或某些表达形式转成更适合符号运算的有理形式，`expand` 则展开表达式，方便后面提取系数。

3. 检查是否含有 `cos(2*theta)` 或 `sin(2*theta)`

   ```maple
   ec := simplify(coeff(e, cos(2*theta)));
   es := simplify(coeff(e, sin(2*theta)));
   ```

   这里分别提取 `cos(2*theta)` 和 `sin(2*theta)` 的系数。如果某个系数非零，就把这个系数作为新的待处理表达式 `z`。

   这样做的目的通常是：如果某个方程整体带有明显的三角因子，真正需要求零的部分往往是它前面的代数系数。

4. 记录并移除三角因子

   ```maple
   if ec <> 0 then
       trigFactor := cos(2*theta);
       z := ec;
   elif es <> 0 then
       trigFactor := sin(2*theta);
       z := es;
   else
       z := e;
   end if;
   ```

   如果发现 `cos(2*theta)` 的系数非零，就优先使用它；否则再检查 `sin(2*theta)`。如果两者都没有，就保留原残差 `e`。

   `trigFactor` 只是用来打印说明，让你知道过程中移除了哪个三角因子。

5. 去掉分母

   ```maple
   z := normal(z);
   den := denom(z);
   num := expand(numer(z));
   ```

   `normal` 会把表达式整理成标准的有理式。随后 `denom(z)` 取分母，`numer(z)` 取分子。

   对于形如 `num/den = 0` 的条件，只要分母不为零，求零点主要看分子 `num = 0`，所以这里继续处理分子。

6. 提取普通变量并去掉公因子

   ```maple
   userVars := indets(num, name) minus {theta};
   cf := content(num, userVars);
   ```

   `indets(num, name)` 会找出表达式里的名字型变量。这里排除了 `theta`，因为 `theta` 在这个过程里主要扮演角变量，前面已经专门处理过三角项。

   `content(num, userVars)` 会提取关于这些变量的公因子。若分子整体存在公共倍数，把它除掉可以让表达式更短。

7. 因式分解最终结果

   ```maple
   final := factor(final);
   ```

   最后对表达式做因式分解，通常能更清楚地看到哪些因子决定残差为零。

8. 打印处理记录

   ```maple
   print("equation", idx);
   ```

   过程会打印当前方程编号，以及被移除的三角因子、分母和公因子。这样在批量处理方程组时，可以回头检查每一步删掉了什么。

## 适合使用的场景

- 从一组符号方程中批量提取真正需要求解的残差项。
- 方程里经常出现 `sin(2*theta)`、`cos(2*theta)` 这样的公共三角因子。
- 方程表达式比较长，需要先去分母、去公因子，再观察主要结构。
- 想在 Maple 中把复杂方程整理成更适合 `solve` 或手动推导的形式。

## 注意事项

- 去掉分母默认隐含分母不为零。如果某些解会让分母为零，需要单独检查。
- 去掉三角因子也会改变对特殊角度的讨论。例如 `cos(2*theta) = 0` 本身可能带来额外情形，如果这些特殊情形重要，需要另外分析。
- 当前过程优先提取 `cos(2*theta)`，只有没有对应系数时才提取 `sin(2*theta)`。如果一个表达式同时含有两类项，需要根据实际问题判断这种优先级是否合适。
- `theta` 被排除在 `content` 的变量集合之外，这是针对当前使用习惯写的。如果以后变量命名变了，可以把 `{theta}` 改成需要排除的角变量集合。
