---
title: MATLAB 读取 Maple 导出文件
date: 20260804
category: 代码
summary: 一个 MATLAB 函数，用于批量读取 Maple 导出的 .m 文件，自动声明符号变量，并把结果加载到 base workspace。
---

# MATLAB 读取 Maple 导出文件

这段 MATLAB 函数 `load_maple` 用来读取当前文件夹中由 Maple 导出的 `.m` 文件。它会提取每个文件中等号右边的表达式，自动识别其中出现的符号变量，生成 `maple_syms.m` 声明文件，然后尝试把表达式求值并放入 MATLAB 的 base workspace。

它适合用于 Maple 推导结束后，把矩阵、向量或符号表达式批量转入 MATLAB 继续计算。

## 代码

```matlab
function load_maple(names)
% load_maple(names)
%
% Purpose:
%   Read selected Maple-exported .m files from the current MATLAB folder.
%   Each file is assumed to contain an assignment such as:
%
%       KA = [...];
%
%   The function extracts the right-hand side, detects all symbolic variable
%   names appearing in it, generates a declaration file maple_syms.m, runs
%   that declaration file, evaluates the right-hand side, and assigns the
%   result to the base workspace using the file name as the variable name.
%
% Usage:
%   load_maple(["KA", "fA", "KB", "fB", "RA", "RB"])
%   load_maple(["KA.m", "fA.m"])
%
% Output:
%   Creates variables KA, fA, KB, ... in the base workspace.
%   Also creates maple_syms.m in the current folder.

    % Convert input names to string array.
    names = string(names);

    % Store extracted right-hand-side expressions.
    rhsList = strings(numel(names), 1);

    % Store MATLAB variable names generated from file names.
    baseNames = strings(numel(names), 1);

    % Store actual file names with .m extension.
    fileNames = strings(numel(names), 1);

    % Collect all symbolic variable names detected across all files.
    allVars = strings(0, 1);

    for k = 1:numel(names)
        inputName = names(k);

        % Split input into base file name and extension.
        [~, baseName, ext] = fileparts(inputName);

        % Allow both "KA" and "KA.m".
        if ext == ""
            fileName = baseName + ".m";
        else
            fileName = baseName + ext;
        end

        filePath = fullfile(pwd, fileName);

        % Skip missing files.
        if ~isfile(filePath)
            warning("File not found: %s", filePath);
            continue;
        end

        % Read the whole Maple-exported file as text.
        txt = fileread(filePath);

        % Locate the first assignment sign.
        eqPos = strfind(txt, '=');
        if isempty(eqPos)
            warning("No '=' found in %s. Skipped.", fileName);
            continue;
        end

        % Keep only the right-hand side of the first assignment.
        rhs = txt(eqPos(1) + 1:end);
        rhs = strtrim(rhs);

        % Remove trailing content after the last semicolon.
        semiPos = find(rhs == ';', 1, 'last');
        if ~isempty(semiPos)
            rhs = extractBefore(rhs, semiPos);
        end

        % Convert Maple-style operators to MATLAB elementwise operators.
        % This is safe for symbolic expressions and arrays.
        rhs = strrep(rhs, '^', '.^');
        rhs = strrep(rhs, '*', '.*');
        rhs = strrep(rhs, '/', './');

        % Save expression and target variable name.
        rhsList(k) = rhs;
        baseNames(k) = matlab.lang.makeValidName(baseName);
        fileNames(k) = fileName;

        % Detect symbolic variables from this expression.
        newVars = detect_vars(rhs);

        % Force column shape to avoid vertical concatenation errors.
        allVars = [allVars; newVars(:)];
    end

    % Remove duplicate symbolic variable names.
    allVars = unique(allVars);

    % Generate maple_syms.m in the current folder.
    write_syms_file(allVars, fullfile(pwd, "maple_syms.m"));

    % Run symbolic declarations inside this function workspace.
    run(fullfile(pwd, "maple_syms.m"));

    % Evaluate each expression and assign it to the base workspace.
    for k = 1:numel(names)
        if rhsList(k) == ""
            continue;
        end

        varName = baseNames(k);
        rhs = rhsList(k);

        try
            % Evaluate using symbols declared above.
            val = eval(rhs);

            % Put result into base workspace.
            assignin('base', varName, val);

            fprintf("Loaded %s from %s\n", varName, fileNames(k));
        catch ME
            % If evaluation fails, save the raw RHS string instead.
            warning("Failed to evaluate %s. Saving RHS as text instead. Reason: %s", ...
                fileNames(k), ME.message);
            assignin('base', varName, rhs);
        end
    end

    fprintf("Generated symbolic declaration file: maple_syms.m\n");
end

function vars = detect_vars(exprText)
% detect_vars(exprText)
%
% Extract candidate variable names from a text expression.
% Function names such as sin, cos, sqrt, etc. are removed.

    % Match MATLAB-like names: start with a letter, followed by letters,
    % digits, or underscores.
    tokens = regexp(exprText, '\<[A-Za-z]\w*\>', 'match');

    % Convert to unique string column vector.
    vars = unique(string(tokens));
    vars = vars(:);

    % Reserved names that should not be declared as symbolic variables.
    reserved = [
        "sin"; "cos"; "tan"; "asin"; "acos"; "atan"; ...
        "sinh"; "cosh"; "tanh"; ...
        "exp"; "log"; "ln"; "sqrt"; ...
        "pi"; "inf"; "Inf"; "nan"; "NaN"; ...
        "i"; "j"
    ];

    % Remove reserved names.
    vars = setdiff(vars, reserved);

    % Keep only valid MATLAB variable names.
    vars = vars(arrayfun(@(s) isvarname(s), vars));

    % Ensure column vector output.
    vars = vars(:);
end

function write_syms_file(vars, filePath)
% write_syms_file(vars, filePath)
%
% Create a MATLAB script containing symbolic declarations.
% Each variable is written on a separate line:
%
%   syms A__n11
%   syms r__0

    fid = fopen(filePath, 'w');

    if fid < 0
        error("Cannot create %s", filePath);
    end

    fprintf(fid, "%% Auto-generated by load_maple.m\n");

    if isempty(vars)
        fprintf(fid, "%% No symbolic variables detected.\n");
        fclose(fid);
        return;
    end

    % Write one symbolic declaration per line.
    for k = 1:numel(vars)
        fprintf(fid, "syms %s\n", vars(k));
    end

    fclose(fid);
end
```

## 参数

- `names`：需要读取的 Maple 导出文件名列表。可以写成不带扩展名的形式，例如 `"KA"`，也可以写成带扩展名的形式，例如 `"KA.m"`。

输入会被统一转换成 MATLAB string array，因此推荐这样调用：

```matlab
load_maple(["KA", "fA", "KB", "fB", "RA", "RB"])
```

## 返回值或输出

这个函数没有显式返回值，但会产生两个主要输出：

- 在当前 MATLAB 文件夹中生成 `maple_syms.m`，其中包含自动识别出的 `syms` 声明。
- 在 base workspace 中生成与文件名同名的变量，例如 `KA.m` 会生成变量 `KA`。

如果某个表达式无法成功求值，函数不会直接中断，而是把右端表达式保存为字符串放入 base workspace，并给出 warning。

## 处理流程

1. 统一文件名格式

   ```matlab
   names = string(names);
   [~, baseName, ext] = fileparts(inputName);
   ```

   函数允许输入 `"KA"` 或 `"KA.m"`。如果没有扩展名，会自动补上 `.m`。

2. 读取 Maple 导出的 `.m` 文件

   ```matlab
   txt = fileread(filePath);
   eqPos = strfind(txt, '=');
   ```

   每个文件被假定包含一个赋值语句，例如 `KA = [...];`。函数找到第一个等号，并把等号右边作为真正需要转入 MATLAB 的表达式。

3. 提取右端表达式

   ```matlab
   rhs = txt(eqPos(1) + 1:end);
   rhs = strtrim(rhs);
   ```

   这里只保留赋值号右边的内容。文件名本身会决定最后写入 base workspace 的变量名。

4. 去掉末尾分号之后的内容

   ```matlab
   semiPos = find(rhs == ';', 1, 'last');
   if ~isempty(semiPos)
       rhs = extractBefore(rhs, semiPos);
   end
   ```

   Maple 导出的表达式通常以分号结尾。这里把最后一个分号之前的内容保留下来，避免后续 `eval` 时混入多余字符。

5. 转换运算符

   ```matlab
   rhs = strrep(rhs, '^', '.^');
   rhs = strrep(rhs, '*', '.*');
   rhs = strrep(rhs, '/', './');
   ```

   这一步把普通乘除和幂转换为 MATLAB 的 elementwise 运算符。对于符号表达式和数组表达式，这样通常更稳，尤其是在后续可能涉及矩阵或向量元素运算时。

6. 自动识别符号变量

   ```matlab
   newVars = detect_vars(rhs);
   allVars = [allVars; newVars(:)];
   ```

   `detect_vars` 会用正则表达式找出表达式中的候选变量名，并过滤掉 `sin`、`cos`、`sqrt`、`pi` 等内置函数或常量。

7. 生成并运行符号声明文件

   ```matlab
   write_syms_file(allVars, fullfile(pwd, "maple_syms.m"));
   run(fullfile(pwd, "maple_syms.m"));
   ```

   所有识别到的变量会写入 `maple_syms.m`，每个变量一行 `syms` 声明。随后函数运行这个文件，让这些符号变量在当前函数工作区中可用。

8. 求值并写入 base workspace

   ```matlab
   val = eval(rhs);
   assignin('base', varName, val);
   ```

   如果 `eval` 成功，得到的符号表达式、矩阵或向量会被写入 base workspace。变量名来自文件名，并通过 `matlab.lang.makeValidName` 转成合法 MATLAB 变量名。

## 适合使用的场景

- Maple 已经把多个矩阵或向量导出成 `.m` 文件，需要一次性加载进 MATLAB。
- 导出的表达式里含有大量符号变量，不想手动逐个写 `syms`。
- 希望导入变量名和文件名保持一致，例如 `KA.m` 对应 MATLAB 变量 `KA`。
- 想保留一个可复用的 Maple 到 MATLAB 符号表达式导入流程。

## 注意事项

- 这个函数默认每个导出文件至少有一个 `=`，并且真正需要的表达式在第一个等号右边。
- 运算符会被统一替换成 `.^`、`.*` 和 `./`。如果某些表达式本来需要矩阵乘法、矩阵除法或矩阵幂，需要手动检查。
- 变量识别基于文本正则匹配，复杂函数名或自定义函数名可能会被误认为符号变量，需要按实际情况加入 reserved 列表。
- 函数依赖 Symbolic Math Toolbox，因为生成的 `maple_syms.m` 使用了 `syms`。
- `maple_syms.m` 会写入当前 MATLAB 文件夹。如果当前目录已有同名文件，会被覆盖。

## 示例

```matlab
load_maple(["KA", "fA", "KB", "fB", "RA", "RB"])
```

运行后，函数会尝试读取当前文件夹中的 `KA.m`、`fA.m`、`KB.m`、`fB.m`、`RA.m` 和 `RB.m`，生成符号声明文件 `maple_syms.m`，并把对应变量加载到 base workspace。
