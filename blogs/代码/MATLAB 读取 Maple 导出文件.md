---
title: MATLAB 读取 Maple 导出文件
date: 20260804
category: 代码
summary: 一个 MATLAB 函数，用于读取 Maple 导出的 .m 文件，转换索引变量，使用 str2sym 生成符号表达式，并返回结构体结果。
---

# MATLAB 读取 Maple 导出文件

这段 MATLAB 函数 `load_maple` 用于读取 Maple 导出的 `.m` 文件，并把其中的右端表达式转换成 MATLAB 可继续处理的符号表达式。

新版代码不再使用 `eval` 求值，而是使用 `str2sym` 解析表达式；同时会把 `A(4,1,3)`、`E(2)`、`r(3)`、`nu(1)` 这类 Maple 风格的索引变量转换成合法 MATLAB 符号变量名，例如 `A_4_1_3`、`E_2`、`r_3`、`nu_1`。函数会返回结构体 `S`，也会把结果同步写入 base workspace。

## 代码

```matlab
function S = load_maple(names)
% load_maple(names)
%
% 功能：
%   读取 Maple 导出的 .m 文件，并转换为 MATLAB 符号表达式。
%
% 特点：
%   1. 不使用 eval，使用 str2sym 解析符号表达式；
%   2. 将 A(4,1,3)、E(2)、r(3)、nu(1) 等转换为 A_4_1_3、E_2、r_3、nu_1；
%   3. 自动处理 BesselI -> besseli，Pi -> pi，ln -> log；
%   4. 输出索引变量转换记录；
%   5. 将所有符号变量声明写入 maple_syms.m；
%   6. 返回结构体 S，同时写入 base workspace。
%
% 用法：
%   S = load_maple(["K", "f", "R"]);
%   run("maple_syms.m");
%   K = S.K;
%   f = S.f;
%   R = S.R;

    names = string(names);
    S = struct();

    allConverted = strings(0, 2);
    allVars = strings(0, 1);

    for k = 1:numel(names)
        inputName = names(k);

        % 允许输入 "K" 或 "K.m"。
        [~, baseName, ext] = fileparts(inputName);

        if ext == ""
            fileName = baseName + ".m";
        else
            fileName = baseName + ext;
        end

        filePath = fullfile(pwd, fileName);

        if ~isfile(filePath)
            warning("文件不存在：%s", filePath);
            continue;
        end

        % 读取 Maple 导出的文件内容。
        txt = fileread(filePath);

        % 提取等号右边表达式。
        rhs = extract_rhs(txt);

        % 转换表达式文本，并记录被转换的索引变量。
        [rhs, converted] = normalize_maple_text(rhs);

        converted = unique(converted, "rows");
        allConverted = [allConverted; converted]; %#ok<AGROW>

        if ~isempty(converted)
            fprintf("文件 %s 中转换了以下索引变量：\n", fileName);
            for j = 1:size(converted, 1)
                fprintf("  %s  ->  %s\n", converted(j, 1), converted(j, 2));
            end
        end

        % 检测当前表达式中的符号变量。
        vars = detect_symbol_vars(rhs);
        allVars = [allVars; vars(:)]; %#ok<AGROW>

        varName = matlab.lang.makeValidName(baseName);

        try
            % 将文本解析为符号表达式。
            val = str2sym(rhs);

            % 保存到结构体。
            S.(varName) = val;

            % 同时保存到 base workspace。
            assignin("base", varName, val);

            fprintf("已载入 %s -> %s\n", fileName, varName);

        catch ME
            warning("解析 %s 失败，已保存转换后的文本。原因：%s", ...
                fileName, ME.message);

            S.(varName) = rhs;
            assignin("base", varName, rhs);
        end
    end

    allConverted = unique(allConverted, "rows");
    allVars = unique(allVars);

    % 输出总转换记录。
    if ~isempty(allConverted)
        fprintf("\n全部索引变量转换汇总：\n");
        for j = 1:size(allConverted, 1)
            fprintf("  %s  ->  %s\n", allConverted(j, 1), allConverted(j, 2));
        end
    end

    % 写入符号变量声明文件。
    symsFile = fullfile(pwd, "maple_syms.m");
    write_symbol_file(allVars, symsFile);

    fprintf("\n共检测到 %d 个符号变量。\n", numel(allVars));
    fprintf("符号变量声明已写入：%s\n", symsFile);
    fprintf("可在 MATLAB 命令行运行：run('maple_syms.m')\n");

    fprintf("\n已完成表达式载入。\n");
end

function rhs = extract_rhs(txt)
% 提取 Maple 导出文件中第一个等号右边的表达式。

    eqPos = strfind(txt, '=');

    if isempty(eqPos)
        error("文件中没有找到等号。");
    end

    rhs = txt(eqPos(1) + 1:end);
    rhs = strtrim(rhs);

    % 去掉最后一个分号及其后的内容。
    semiPos = find(rhs == ';', 1, 'last');

    if ~isempty(semiPos)
        rhs = extractBefore(rhs, semiPos);
    end

    rhs = char(rhs);
end

function [txt, converted] = normalize_maple_text(txt)
% 将 Maple/MATLAB 导出的表达式文本转换为适合 str2sym 的格式。

    txt = char(txt);

    % Maple 函数名转换为 MATLAB 符号工具箱可识别的函数名。
    txt = regexprep(txt, '\bBesselI\s*\(', 'besseli(');

    % Maple 常数 Pi 转为 MATLAB pi。
    txt = regexprep(txt, '\bPi\b', 'pi');

    % Maple 的 ln(...) 转为 MATLAB 的 log(...)。
    txt = regexprep(txt, '\bln\s*\(', 'log(');

    % 只转换明确作为索引变量的名字。
    indexedNames = ["A", "E", "r", "nu"];

    [txt, converted] = flatten_indexed_symbols(txt, indexedNames);

    % str2sym 使用普通符号运算符即可。
    txt = strrep(txt, '.^', '^');
    txt = strrep(txt, '.*', '*');
    txt = strrep(txt, './', '/');

    txt = string(txt);
end

function [txt, converted] = flatten_indexed_symbols(txt, indexedNames)
% 将白名单中的索引变量转换为普通符号变量名。
%
% 示例：
%   A(4,1,3) -> A_4_1_3
%   E(2)     -> E_2
%   r(3)     -> r_3

    txt = char(txt);
    indexedNames = string(indexedNames);

    converted = strings(0, 2);

    for n = 1:numel(indexedNames)
        name = indexedNames(n);

        % 匹配 A(...)、E(...)、r(...) 等白名单索引变量。
        pattern = "\<" + name + "\s*\(([^()]*)\)";
        pattern = char(pattern);

        while true
            [startIdx, endIdx, tokens] = regexp(txt, pattern, ...
                'start', 'end', 'tokens', 'once');

            if isempty(startIdx)
                break;
            end

            rawText = string(txt(startIdx:endIdx));
            args = string(tokens{1});

            newName = make_flat_symbol_name(name, args);

            converted(end+1, :) = [rawText, string(newName)]; %#ok<AGROW>

            txt = [txt(1:startIdx-1), newName, txt(endIdx+1:end)];
        end
    end
end

function newName = make_flat_symbol_name(name, args)
% 根据索引变量名和索引内容生成普通符号变量名。

    name = char(name);
    args = char(args);

    % 删除空格。
    args = regexprep(args, '\s+', '');

    % 将索引中的特殊符号转换成合法变量名的一部分。
    args = strrep(args, ',', '_');
    args = strrep(args, '+', 'p');
    args = strrep(args, '-', 'm');
    args = strrep(args, '*', '_');
    args = strrep(args, '/', '_');

    % 拼接并确保是合法 MATLAB 变量名。
    newName = matlab.lang.makeValidName([name, '_', args]);
end

function vars = detect_symbol_vars(exprText)
% 检测表达式文本中的符号变量名。

    exprText = char(exprText);

    % 提取所有 MATLAB 变量名格式的 token。
    tokens = regexp(exprText, '\<[A-Za-z]\w*\>', 'match');

    vars = unique(string(tokens));
    vars = vars(:);

    % 不应声明为符号变量的函数名和常数。
    reserved = [
        "sin"; "cos"; "tan"; "asin"; "acos"; "atan"; ...
        "sinh"; "cosh"; "tanh"; ...
        "exp"; "log"; "sqrt"; ...
        "besseli"; "besselj"; "besselk"; "bessely"; ...
        "pi"; "inf"; "Inf"; "nan"; "NaN"; ...
        "i"; "j"
    ];

    vars = setdiff(vars, reserved);

    % 排除仍然作为函数调用出现的名字。
    funcTokens = regexp(exprText, '\<([A-Za-z]\w*)\s*\(', 'tokens');

    if ~isempty(funcTokens)
        funcs = unique(string([funcTokens{:}]));
        funcs = setdiff(funcs, reserved);
        vars = setdiff(vars, funcs);
    end

    % 只保留合法变量名。
    vars = vars(arrayfun(@(s) isvarname(s), vars));
    vars = vars(:);
end

function write_symbol_file(vars, filePath)
% 将符号变量声明写入 .m 文件。

    fid = fopen(filePath, "w");

    if fid < 0
        error("无法创建文件：%s", filePath);
    end

    fprintf(fid, "%% Auto-generated by load_maple.m\n");
    fprintf(fid, "%% Maple 符号变量声明文件\n\n");

    if isempty(vars)
        fprintf(fid, "%% 未检测到符号变量。\n");
        fclose(fid);
        return;
    end

    for k = 1:numel(vars)
        v = char(vars(k));

        % 使用 sym('变量名')，避免 syms 与已有函数名冲突。
        fprintf(fid, "%s = sym('%s');\n", v, v);
    end

    fclose(fid);
end
```

## 参数

- `names`：需要读取的 Maple 导出文件名列表。可以写成不带扩展名的形式，例如 `"K"`，也可以写成带扩展名的形式，例如 `"K.m"`。

推荐调用方式：

```matlab
S = load_maple(["K", "f", "R"]);
```

## 返回值或输出

函数返回结构体 `S`。每个字段名来自对应的文件名，例如 `K.m` 会写入 `S.K`。

同时，函数还会产生这些输出：

- 将成功解析的结果写入 base workspace，例如变量 `K`、`f`、`R`。
- 在当前 MATLAB 文件夹中生成 `maple_syms.m`。
- 在命令行打印索引变量转换记录，例如 `A(4,1,3) -> A_4_1_3`。
- 如果某个表达式无法被 `str2sym` 解析，会把转换后的文本保存到 `S` 和 base workspace 中，并给出 warning。

## 处理流程

1. 统一文件名格式

   ```matlab
   [~, baseName, ext] = fileparts(inputName);
   ```

   函数允许输入 `"K"` 或 `"K.m"`。如果没有扩展名，会自动补上 `.m`。

2. 提取右端表达式

   ```matlab
   rhs = extract_rhs(txt);
   ```

   `extract_rhs` 会找到第一个等号，并保留等号右边、最后一个分号之前的内容。

3. 转换 Maple 表达式文本

   ```matlab
   [rhs, converted] = normalize_maple_text(rhs);
   ```

   这一步会处理 Maple 与 MATLAB 的语法差异，例如：

   - `BesselI(...)` 转为 `besseli(...)`。
   - `Pi` 转为 `pi`。
   - `ln(...)` 转为 `log(...)`。
   - `A(4,1,3)` 这类索引变量转为 `A_4_1_3`。

4. 将索引变量扁平化

   ```matlab
   [txt, converted] = flatten_indexed_symbols(txt, indexedNames);
   ```

   当前白名单为 `["A", "E", "r", "nu"]`。只有这些名字后面的括号索引会被当成索引变量转换，避免误伤普通函数调用。

5. 检测符号变量

   ```matlab
   vars = detect_symbol_vars(rhs);
   ```

   函数会提取表达式中的变量名，并排除 `sin`、`cos`、`sqrt`、`besseli`、`pi` 等函数名或常数。

6. 使用 `str2sym` 解析表达式

   ```matlab
   val = str2sym(rhs);
   ```

   这是新版代码的核心变化：不再使用 `eval`，而是让 Symbolic Math Toolbox 解析文本表达式。

7. 写入结构体和 base workspace

   ```matlab
   S.(varName) = val;
   assignin("base", varName, val);
   ```

   这样既可以通过 `S.K` 访问结果，也可以直接在 base workspace 中使用变量 `K`。

8. 生成符号变量声明文件

   ```matlab
   write_symbol_file(allVars, symsFile);
   ```

   `maple_syms.m` 中使用 `变量名 = sym('变量名');` 的形式声明变量，避免 `syms` 与已有函数名冲突。

## 适合使用的场景

- Maple 导出的表达式中含有 `A(4,1,3)`、`E(2)`、`r(3)` 这类索引变量。
- 不希望使用 `eval`，想用更明确的 `str2sym` 解析符号表达式。
- 需要同时得到结构体结果和 base workspace 变量。
- 需要记录 Maple 索引变量到 MATLAB 合法变量名的转换关系。

## 注意事项

- 函数依赖 Symbolic Math Toolbox，因为使用了 `str2sym` 和 `sym`。
- 当前只会扁平化白名单中的索引变量：`A`、`E`、`r`、`nu`。如果还有其他索引变量，需要加入 `indexedNames`。
- `extract_rhs` 默认使用第一个等号右边作为表达式，并截断到最后一个分号之前。
- `maple_syms.m` 会写入当前 MATLAB 文件夹；如果已有同名文件，会被覆盖。
- `str2sym` 对表达式语法比较敏感。如果 Maple 导出文本中有未处理的特殊函数或语法，需要继续在 `normalize_maple_text` 中补充转换规则。

## 示例

```matlab
S = load_maple(["K", "f", "R"]);
run("maple_syms.m");

K = S.K;
f = S.f;
R = S.R;
```

运行后，函数会读取当前文件夹中的 `K.m`、`f.m` 和 `R.m`，将表达式转换为符号对象，保存到结构体 `S`，并同步写入 base workspace。
