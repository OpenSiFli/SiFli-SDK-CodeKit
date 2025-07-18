# sifli-sdk-codekit - VS Code 插件

`sifli-sdk-codekit` 为简化 `SiFli-SDK` 开发的 VS Code 插件。提供一系列便捷的按钮选项，帮助用户方便进行项目管理、编译、下载及配置。

---

## 🚀 版本特点

* **1.0.1版本：** 
  * 实现了项目编译、固件下载、清理构建产物、重新编译以及访问 Menuconfig 等核心功能。
  * 能够根据用户当前打开的工程自动判断是否激活插件。
  * 在执行任何操作前，插件会自动保存当前所有未保存的文件，确保始终基于最新代码进行操作。
  * 此外，还支持用户自定义 PowerShell 终端和 `SiFli-SDK` 脚本的安装路径。
* **1.0.2版本：** 
    * 加入了串口自动输入功能。在执行 **💾下载** 或 **🚀编译并下载** 任务时，插件会自动检测并处理连接到用户电脑上的串口设备。
      * **无串口设备：** 如果未检测到任何 **“USB-SERIAL CH340”** 类型的串口设备，插件将友好地提示用户检查设备连接状态。
      * **单个 CH340 串口：** 若仅检测到一个 **“USB-SERIAL CH340”** 串口，插件将自动提取其串口号，并将其作为参数自动输入给下载命令。
      * **多个 CH340 串口：** 如果检测到多个 **“USB-SERIAL CH340”** 串口，插件会弹出一个选择界面，列出所有可用的串口设备供用户选择。用户选定后，插件会自动提取对应的纯数字串口号并进行输入。
* **1.0.3版本：** 
  * 增加对 SiFli 其他芯片模组的支持：

    * sf32lb52-lcd_52d

    * sf32lb52-lcd_base

    * sf32lb52-lcd_n16r8

    * sf32lb52-lchspi-ulp（黄山派）

    * sf32lb52-lchspi-ulp_base

    * sf32lb52-nano_52b

    * sf32lb52-nano_52j

    * sf32lb52-nano_base

    * sf32lb56-lcd_a128r12n1

    * sf32lb56-lcd_base

    * sf32lb56-lcd_n16r12n1

    * sf32lb58-lcd_a128r32n1_dsi

    * sf32lb58-lcd_base

    * sf32lb58-lcd_n16r32n1_dpi

    * sf32lb58-lcd_n16r32n1_dsi

    * sf32lb58-lcd_n16r64n4

* 首次激活引导： 当用户首次激活插件时，将自动弹出选择界面，提示用户选择一款芯片模组进行开发。

  * 默认选择： 若用户没有进行选择，插件将默认为 黄山派:sf32lb52-lchspi-ulp。

* 模组更换： 如果用户想更换芯片模组，可以通过以下路径进行操作：打开 VS Code 设置 -> 搜索 “sifli-sdk-codekit” -> 更改芯片模组选项。


* **1.0.4版本：**
  * 优化了使用体验
  * 模组更换： 如果用户想更换芯片模组，**可以通过点击左下角的 `SiFLi Board `选项卡进行更换芯片模组，选择线程数**，或者通过以下路径进行操作：打开 VS Code 设置 -> 搜索 “sifli-sdk-codekit” -> 更改芯片模组选项。

<!-- * **1.1版本：**

* 加入sdk环境的自动安装(要考虑很多情况) -->
---

## 🗂️ 当前目录结构

    ```
    sifli-sdk-codekit

    +---.vscode
    |   |
    |   +---launch.json                     // VS Code 调试配置文件。
    |
    +---images
    |   |
    |   +---vsix_install.png
    |   |     
    |   +---open_setting.png
    |   | 
    |   +---config_path.png
    |   |
    |   +---multiple_serial_devices.png
    |   |
    |   +---select_the_current_module.png
    |   |
    |   +---change_the_module_selection.png
    |   |
    |   +---download.png
    |
    +---extension.js                        // 插件的主入口文件。
    |
    +---package.json                        // 插件的清单文件。
    |
    +---LICENSE.txt                         // 许可证文件。
    |
    +---README.md                           // 项目的说明文档。
    ```

---

## ✨ 功能特性

* **SiFli 工程自动检测：**
    * 扩展程序会自动地检测当前 VS Code 工作区是否为 SiFli 项目。
    * **判定标准：** 判断依据是工作区根目录下是否存在 `src/SConscript` 文件。
    * **重要提示：** 只有当此文件存在时，插件的各项功能（如状态栏按钮）才会被激活并显示。如果用户的项目结构不符合此标准，插件将不会启动其 SiFli 相关功能。
* **一键编译：** 点击状态栏上的“Build”按钮（🛠️ Build）即可编译用户的 SiFli 项目。
* **一键下载 (自动串口识别)：**
    * 使用状态栏上的“Download”按钮（💾 Download）即可将编译好的 SiFli 项目下载到用户的设备。
    * **串口判定逻辑：** 扩展会通过 PowerShell 命令自动识别用户电脑上所有连接的串口。它会特别查找 **“USB-SERIAL CH340”** 类型的串口设备。
        * 如果只找到一个此类串口，它会自动选择并将其端口号（纯数字，例如 `5`）作为输入发送给烧录工具。
        * 如果找到多个此类串口，它会弹出一个列表供用户选择。
        * 如果没有找到此类串口，则会提示用户检查设备连接。
    * **注意：** 扩展目前仅支持识别和处理 CH340 芯片的串口设备。
* **清理构建产物：** 通过状态栏上的“Clean”按钮（🗑️ Clean），可以删除特定构建目标文件夹 `build_sf32lb52-lchspi-ulp_hcpu`，有效清理构建输出，为下次编译节省空间。
* **重新构建功能：** 使用状态栏上的“Rebuild”按钮（♻️ Rebuild）可以先执行清理操作，然后进行编译，确保从干净状态开始构建。
* **编译并下载 (自动串口识别)：**
    * 使用状态栏上的“Build & Download”按钮（🚀 Build & Download）可以一键完成项目的编译，并在编译成功后，自动启动下载过程。
    * **串口判定：** 同样会遵循上述“一键下载”的自动串口识别和选择逻辑。
* **Menuconfig 访问：** 通过状态栏上的“Menuconfig”按钮（⚙️ Menuconfig）快速打开 `SiFli-SDK` 的图形化配置界面，方便调整项目参数。
* **自动保存文件：** 在执行任何编译或下载任务之前，所有当前未保存的文件都会自动保存，以确保用户使用的是最新的代码，避免因文件未保存而导致的编译错误或旧代码烧录。
* **可配置路径：** 用户可以通过 VS Code 设置自定义 PowerShell 可执行文件和 `SiFli-SDK` 的 `export.ps1` 脚本的路径，确保扩展能够适应不同的开发环境。
* **增加对sifli其他芯片模组的支持：** 当用户首次激活插件时，会提示用户选择一款芯片模组进行开发( **“若用户没有选择，则默认为黄山派:sf32lb52-lchspi-ulp”** )，如果用户想更换芯片模组，打开 VS Code 设置搜索 One-step-for-sifli ，更改芯片模组。

---

## 入门指南

### 安装

1.  打开 VS Code。
2.  进入插件视图（快捷键 `Ctrl+Shift+X` 或 `Cmd+Shift+X`）。
3.  点击界面右方的三个点`...`，在弹出的选项卡中选择从VSIX安装。
4.  在弹出的界面中填入`.vsix`文件的下载地址，选中`.vsix`文件安装即可。
5.  ![如何安装插件](images\vsix_install.png)
### 配置

在使用插件之前，用户需要配置默认开发的sifli芯片模组、关于下载`SiFli-SDK`所配置的 PowerShell 的终端路径和`SiFli-SDK`下的 `export.ps1` 脚本的路径。

1.  **选择芯片模组：**
    通过点击左下角的 `SiFLi Board `选项卡进行更换芯片模组，选择线程数
    * ![选择芯片模组](images\select_the_current_module.png)
  
    **选择线程数量：** 
    通过点击左下角的
    * ![选择芯片模组](images\Select_the_number_of_threads.png)

2.  **打开 VS Code 设置：**
    * Windows/Linux: `文件` > `首选项` > `设置`
    * ![如何打开设置](images\open_setting.png)
  
3.  在设置搜索框中输入“sifli-sdk-codekit”，或者导航到“插件”并找到“sifli-sdk-codekit Configuration”。
   
4.  **PowerShell 路径 (`sifli-sdk-codekit.powershellPath`)：**
    * 输入用户的 PowerShell 可执行文件的完整路径。
    * 在 Windows 系统上，默认路径通常是 `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`。
  
5.  **SiFli SDK 导出脚本路径 (`sifli-sdk-codekit.sifliSdkExportScriptPath`)：**
    * 输入位于用户的`SiFli-SDK`安装目录中的 `export.ps1` 脚本的完整路径（例如，`D:\OpenSiFli\SiFli-SDK\export.ps1`）。
    * 此脚本对于设置`SiFli-SDK`命令的正确环境至关重要。
    * **用户可在此处更换开发的芯片模组**
    * ![如何更改芯片模组、填写SF32终端和export.ps1脚本路径](images\change_module_and_path_setting.png)
### 使用

一旦配置完成并打开一个 SiFli 工程（即工作区根目录下存在 `src/SConscript` 文件），状态栏上将显示插件的功能按钮：

* **🛠️ Build：** 编译项目。
* **♻️ Rebuild：** 清理并重新编译项目。
* **🗑️ Clean：** 清理构建产物。
* **💾 Download：** 下载已编译的项目到设备。
* **🚀 Build & Download：** 编译项目并自动下载。
* **⚙️ Menuconfig：** 进入`SiFli-SDK`的配置界面。
## 单个CH340串口的自动输入下载
* ![单个CH340串口的自动输入下载](images\one_serial_device.png)
## 多个CH340串口的自动输入下载 
* ![多个CH340串口的选择输入自动下载](images\multiple_serial_devices.png)

点击这些按钮即可执行相应的操作。所有命令的执行情况会在 VS Code 的终端中显示。

---

## ❓ 常见问题 (FAQ)

* **问：为什么我安装了扩展却没有看到状态栏按钮？**
    * 答：请首先确保用户打开的工作区是一个 **SiFli 工程**。扩展会检查工作区根目录下是否存在 `src/SConscript` 文件作为判定依据。如果不是 SiFli 工程，扩展功能将不会被激活，状态栏按钮也不会显示。
* **问：我的命令执行失败了，终端显示错误怎么办？**
    * 答：请检查用户的扩展设置中：
        * `PowerShell 路径` 和 `SiFli SDK 导出脚本路径` 是否正确填写，确保这些路径指向的文件真实存在且可执行。
        * 确保用户的 `SiFli-SDK` 环境本身已正确配置，并且所有依赖项（如 `scons`、`sftool` 等）都在系统的 PATH 环境变量中或可以通过 `export.ps1` 正确设置。
        * 同时，检查命令是否在正确的项目目录下执行（扩展会自动 `cd` 到 `project` 文件夹，但如果该文件夹不存在则会警告）。
* **问：为什么终端打开后没有自动切换到 `project` 目录？**
    * 答：请确保用户的工作区根目录下存在一个名为 `project` 的文件夹。扩展会尝试 `cd` 到这个子文件夹来执行命令。在极少数情况下，如果终端启动或命令发送过快导致“卡顿”，插件按钮在执行实际命令前会先额外执行一次 `cd "${projectPath}"`，确保用户在 `project` 目录下执行后续操作，以提高稳定性。
* **问：为什么我的 CH340 串口设备没有被自动识别？**
    * 答：请确认以下几点：
        * **驱动是否正确安装：** 确保用户的 CH340 芯片的驱动已正确安装在电脑上。用户可以在设备管理器中查看“端口 (COM & LPT)”下是否存在“USB-SERIAL CH340”或类似名称的设备。
        * **设备是否已连接：** 确保用户的 SiFli 设备已通过 USB 连接到电脑，并且电源已打开。
        * **PowerShell 权限：** 确认 VS Code 或其运行环境有足够的权限执行 PowerShell 命令。如果用户的 PowerShell 路径配置不正确或 PowerShell 无法执行外部脚本，也可能导致检测失败。
        * **非 CH340 串口：** 本扩展目前仅针对“USB-SERIAL CH340”类型的串口进行自动识别和选择。如果用户的设备使用了其他型号的 USB 转串口芯片，它可能不会被自动识别。
* **问：~!@#$%^&*() ?**
    * 答：可能有些情况我也没碰见过，我也不知道，感谢谷歌Gemini的大力支持
---