# VoLink

<p align="center">
  <strong>A modern Windows control center for 4G/5G cellular modems.</strong><br>
  Windows 蜂窝模块管理、射频诊断、短信、拨号、eSIM、代理与通知中心。
</p>

<p align="center">
  <a href="https://github.com/w330590751/VoLink/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/w330590751/VoLink/ci.yml?branch=main&style=flat-square&label=build"></a>
  <a href="https://github.com/w330590751/VoLink/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/w330590751/VoLink?style=flat-square&label=download"></a>
  <a href="https://github.com/w330590751/VoLink/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-5b57dc?style=flat-square"></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows11">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-React-47848F?style=flat-square&logo=electron">
</p>

![VoLink dialer and modem control center](assets/screenshots/volink-dial.png)

VoLink 是一套独立实现的 Windows 蜂窝模块桌面软件。它自动发现真实调制解调器和 AT 串口，通过标准及厂商 AT 指令管理设备，并把网络状态、射频诊断、短信、拨号、eSIM、代理和通知整合到一个界面中。

## 主要功能

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 多模块发现 | ✅ | Windows Modem + COM 自动发现、热插拔扫描、手动端口选择 |
| SIM 与网络状态 | ✅ | 运营商、IMEI、IMSI、ICCID、注册状态和固件版本 |
| 专业射频指标 | ✅ | CSQ、dBm、RSRP、RSRQ、SINR、LTE 频段和信道（取决于模块支持） |
| 本机号码 | ✅ | 使用 `AT+CNUM` 自动读取；运营商未写入号码时支持手动补录 |
| 一键设备诊断 | ✅ | 检查 AT 端口、SIM、标识读取、信号、网络注册和分组数据 |
| 直接拨号 | ✅ | `ATD<number>;` 拨号、`ATH` 挂断、本地通话记录 |
| 短信 | ✅ | 发送、同步、删除和本地存储，支持 GSM/UCS2 |
| AT / USSD 终端 | ✅ | 原始 AT 指令和运营商 USSD 会话 |
| eSIM 生命周期 | 条件支持 | 通过 `lpac.exe` 下载、启用、禁用、改名和删除 Profile |
| HTTP / SOCKS5 代理 | ✅ | 多实例、认证和移动网络接口绑定 |
| 通知 | ✅ | Telegram、飞书、QQ Bot、Bark、Email、PushPlus、Webhook |
| 卡策略 | ✅ | APN、IP 版本、蜂窝网络和飞行模式控制 |
| 独立流量开关 | ✅ | 使用 `AT+CGATT` 开关移动数据，不影响短信和语音射频 |
| 在线更新检查 | ✅ | 从 GitHub Releases 查询新版本并打开安全下载地址 |
| VoWiFi / IMS | 能力受限 | 已有策略界面；真实通话需要运营商、模块固件及独立 IMS 后端配合 |

> eSIM 需要兼容 eUICC、`AT+CSIM` 和已配置的 `lpac.exe`。拨号不等于电脑一定有通话音频；音频还取决于模块的语音固件、USB Audio 或厂商音频通道。

## 已验证硬件

- Sierra Wireless EM7430：COM AT 控制、SIM READY、ICCID/IMSI/IMEI 读取、短信和拨号指令
- Quectel、SIMCom、Fibocom、Huawei、ZTE、Telit 等标准 AT 模块具备通用适配逻辑，欢迎提交实际兼容报告

如果你的模块可用，请提交一份 [硬件兼容报告](https://github.com/w330590751/VoLink/issues/new?template=hardware.yml)。请在分享日志前遮盖电话号码、IMSI、ICCID 和 IMEI。

## 下载

从 [GitHub Releases](https://github.com/w330590751/VoLink/releases/latest) 下载最新 Windows x64 便携版，双击即可运行，无需安装。

> 当前 EXE 尚未购买商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”。

## 使用真实模块

1. 安装模块厂商提供的 USB 串口和 WWAN 驱动。
2. 启动 VoLink，在“系统设置”关闭模拟模式，并保持自动扫描开启。
3. 插入模块，等待自动扫描；也可以手动选择 AT 端口。
4. 连接主/分集天线。SIM READY 但无法注册时，请检查 APN、频段和运营商兼容性。
5. 在设备概览点击“运行诊断”，查看端口、SIM、射频和注册状态的具体建议。
6. 语音通话需要支持 Voice/VoLTE 的模块固件；电脑音频还需要可用的音频通道。

## 开发与构建

要求：Node.js 22+、Windows 10/11。

```powershell
npm install
npm run typecheck
npm run dev
```

构建便携 EXE：

```powershell
npm run dist
```

输出：`release/VoLink-1.1.1-portable.exe`

## 架构

- Electron 主进程：硬件发现、串口 AT 会话、短信、通话、代理、通知和更新检查
- React 渲染进程：设备工作台、射频诊断和管理界面
- 本地 JSON 存储：设置、设备、短信、通话记录和日志
- Context Isolation preload：类型化 IPC，界面不直接获得 Node.js 权限

## 与 VoCat 的关系

VoLink 参考了同类开源/可查看项目的产品思路，但代码为独立实现。与 VoCat 的功能和技术差异、适合借鉴的方向及许可边界，见 [VoCat 项目分析](docs/VOCAT_ANALYSIS.zh-CN.md)。VoLink 不包含 VoCat、VoHive 或第三方 VoWiFi 守护程序源码。

## 路线图

- 扩充实际测试的模块配置和 AT 端口自动分类
- Windows Mobile Broadband / MBIM 原生遥测
- 来电事件和音频设备路由
- 运营商 VoLTE / IMS 能力检测
- 代码签名、增量更新和崩溃报告（默认保护隐私）

## 参与贡献

欢迎提交 Bug、已脱敏的模块日志、翻译和硬件支持补丁。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

如果 VoLink 对你有帮助，欢迎 Star 仓库并分享已验证的模块型号。⭐

## 许可

VoLink 使用 [MIT License](LICENSE)。
