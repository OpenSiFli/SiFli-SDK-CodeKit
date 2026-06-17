---
title: 外部 Stub 配置
icon: fa-solid fa-gear
order: 4
---

::: warning 版本要求

`--stub` 和 `--stub-config` 参数需要 **sftool v0.1.19 及以上版本**。可通过 `sftool -V` 查看当前版本号。如果版本过低，请先升级。

:::

## 概述

CodeKit 支持配置外部 stub 二进制文件（`.bin`）和 stub 配置文件（`stub_config.json`），用于替换 sftool 烧录工具内置的默认 stub。

当需要使用自定义的 stub 文件时（例如调试特殊硬件行为或使用特定版本的 stub），可以通过此功能指定外部 stub 路径。

## 操作方式

### 命令面板

在 VS Code 命令面板中执行 `配置 sftool Stub`（英文：`Configure sftool Stub`），打开交互式配置菜单。

### 侧边栏

在 CodeKit 侧边栏底部的**烧录配置**区域，会显示当前 stub 状态标签。点击该标签可直接打开配置菜单。

状态标签含义：

| 状态 | 说明 |
|------|------|
| `Embedded` | 使用 sftool 内置的默认 stub（未配置外部文件） |
| `External bin` | 仅配置了外部 stub bin |
| `Stub config` | 仅配置了 stub config |
| `External bin + config` | 同时配置了外部 stub bin 和 stub config |

## 配置选项

配置菜单提供以下操作：

| 操作 | 说明 |
|------|------|
| 选择外部 stub bin | 选择外部 stub 二进制文件（`.bin`） |
| 选择 stub_config JSON | 选择 stub 配置文件（`.json`） |
| 清除外部 stub bin | 清除已选的外部 stub bin 路径 |
| 清除 stub_config JSON | 清除已选的 stub config 路径 |
| 清除所有 stub 设置 | 同时清除以上两项 |
::: tip

外部 stub 文件可以通过 **sftool-gui** 工具中的"驱动注入与硬件初始化"功能生成。详情请参考 [sftool-gui 官方文档](https://docs.sifli.com/projects/sftool/zh_CN/Feature/#stub配置)。

:::

## 存储方式

外部 stub 配置按工作区独立存储，不会因切换窗口或项目而相互干扰。

## 运行原理

在烧录时，CodeKit 会将配置的路径以命令行参数形式传递给 sftool：

- 配置了 stub bin 时，追加 `--stub "<path>"`
- 配置了 stub config 时，追加 `--stub-config "<path>"`
