---
order: 2
title: 启动项目
icon: play
---

## 新建工程

你可以在以下入口创建新的 SiFli 工程：
- 侧边栏中的 `Create New Project / 新建工程`
- 命令面板中的 `Create new SiFli project / 新建 SiFli 工程`

创建流程如下：
1. 选择要使用的 SiFli SDK。
2. 插件递归扫描该 SDK 的 `example` 目录。
3. 从扫描结果中选择一个受支持的工程模板。
4. 选择目标父目录，并输入新的工程目录名。
5. 插件复制模板，并可选地执行 `git init` 与生成 `.gitignore`。

::: tip
第一版仅列出当前 CodeKit 能直接识别并自动使能的示例工程。像 `boot_loader`、`dfu`、`lcpu_general` 这类特殊目录结构的 example 暂不在列表中。
:::

## 打开已有项目

### SiFli-SDK 工程定义

为了防止在其他工程中 SiFli-SDK-CodeKit 插件造成额外的干扰，SiFli-SDK-CodeKit 插件仅在 SiFli-SDK 工程中激活。SiFli-SDK 工程的定义如下：
- 根目录下存在 `project` 子文件夹。
- 根目录下存在 `project/SConscript`，或 `project/hcpu/SConscript`，或 `project/lcpu/SConscript` 文件。
- 根目录下存在 `src` 子文件夹。

这样，使用 VSCode 打开 SiFli-SDK 工程时，SiFli-SDK-CodeKit 会被自动激活。
