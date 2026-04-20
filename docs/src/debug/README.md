---
title: 硬件调试
icon: fa-solid fa-bug
---

## 支持范围

| 芯片系列 | 调试方式 |
|----------|----------|
| SF32LB52 | UART Debug IP |

主要功能包括：

- **断点调试**：在源码级别设置断点，单步执行，查看调用栈和局部变量
- **外设寄存器查看**：实时读取并展示芯片各外设的寄存器状态
- **IP 分析**：对外设配置进行自动化检查，快速定位潜在配置问题
- **现场导出**：导出内存区域和外设寄存器快照，方便进行问题定位和离线分析

## 调试链路说明

使用 `SF32LB52` 调试时，`launch.json` 中通常需要设置 `env.SIFLI_UART_DEBUG = "1"`。

## 快速开始

1. [创建调试配置（launch.json）](./launch-json.md)
2. [查看外设寄存器](./peripheral-registers.md)
3. [IP 分析](./ip-analysis.md)
4. [导出调试现场](./debug-snapshot.md)
