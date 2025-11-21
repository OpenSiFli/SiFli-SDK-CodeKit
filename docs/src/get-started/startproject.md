---
order: 2
title: 启动项目
icon: play
---

::: warning
目前 SiFli-SDK-CodeKit 插件仍在开发中，目前仅支持打开已有项目，创建新项目的功能正在开发中，敬请期待！
:::

## 打开已有项目

### SiFli-SDK 工程定义

为了防止在其他工程中 SiFli-SDK-CodeKit 插件造成额外的干扰，SiFli-SDK-CodeKit 插件仅在 SiFli-SDK 工程中激活。SiFli-SDK 工程的定义如下：
- 根目录下存在 `project` 子文件夹。
- 根目录下存在 `project/SConscript` 文件。
- 根目录下存在 `src` 子文件夹。

这样，使用 VSCode 打开 SiFli-SDK 工程时，SiFli-SDK-CodeKit 会被自动激活。
