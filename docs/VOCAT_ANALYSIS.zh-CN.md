# VoCat 项目分析与 VoLink 优化方向

> 分析日期：2026-08-13。本文只分析公开文档和产品能力，不复制 VoCat 源码。

## 结论

VoCat 是面向 Linux 蜂窝网关场景的完整控制平面，强项是 Linux 网络栈、VoWiFi/IMS、eSIM、代理路由、远程通知和运维安全。VoLink 面向 Windows 桌面，强项应当是免部署、自动识别 Windows 调制解调器、可视化 AT 诊断和直接拨号。两者运行环境和底层网络能力不同，不适合逐行移植。

本轮 VoLink 选择独立实现以下高价值能力：

1. 用通用 `AT+CESQ` 和 Sierra `AT!GSTATUS?` 补充 RSRP、RSRQ、SINR、频段与信道。
2. 加入一键设备诊断，并针对端口、SIM、信号、注册和数据附着给出可执行建议。
3. 加入 GitHub Releases 更新检查；外部链接仅允许打开 GitHub HTTPS 地址。
4. 明确区分实时设备状态与上次缓存数据，避免模块拔出后继续显示为可用。
5. 优化长短信和日志列表的渲染开销。

## 功能对比

| 能力 | VoCat | VoLink 当前方向 |
| --- | --- | --- |
| 运行平台 | Linux 服务器/网关 | Windows 10/11 桌面 |
| 后端 | Go 服务、SQLite、Linux 系统集成 | Electron 主进程、本地 JSON、Windows/串口集成 |
| 模块控制 | AT、QMI、Linux 网卡和 USB 设备 | Windows Modem/COM 自动发现和 AT 会话 |
| 射频信息 | 完整信号质量与网络状态 | CSQ + RSRP/RSRQ/SINR + 频段/信道，按模块能力降级 |
| 语音 | 重点在 VoWiFi/IMS 服务编排 | 直接 AT 拨号/挂断；音频和 VoLTE 取决于硬件与运营商 |
| eSIM | eUICC Profile 管理 | 通过 lpac 和 APDU 管理兼容 eUICC |
| 代理 | Linux 策略路由和代理 | Windows HTTP/SOCKS5 多实例与接口绑定 |
| 通知 | 多渠道通知 | Telegram、飞书、QQ、Bark、Email、PushPlus、Webhook |
| 运维安全 | 登录、CSRF、审计、服务日志 | 本地应用、context isolation、受限 IPC 和外链白名单 |

## 不直接移植 VoWiFi/IMS 的原因

VoCat 的 VoWiFi 能力依赖 Linux 特有组件及系统能力，例如 IKEv2、EAP-AKA、XFRM/IPsec、策略路由和 IMS 守护进程。Windows 桌面不能把这些 Linux 实现直接复制过来。VoLink 中的 VoWiFi 开关目前是能力策略和状态模型，不代表任意 SIM、模块和运营商都能建立 IMS 通话。

要让 Windows 版真正支持 VoWiFi，需要单独完成：

- 确定模块是主机侧 IMS 还是模块内置 IMS；
- 获取运营商的 EPDG、鉴权和 IMS 配置；
- 建立 Windows 可用的 IKEv2/EAP-AKA 或厂商 SDK 后端；
- 处理音频设备、SIP/IMS 会话、紧急呼叫和合规要求；
- 针对每家运营商做实网认证。

这是一项独立子项目，不能仅靠界面开关实现。

## 后续优先级

### P0：硬件稳定性

- 为更多 Sierra、Quectel、Fibocom、SIMCom 型号建立可测试的命令配置。
- 识别 AT、诊断、GPS 和 NMEA 端口，避免选错串口。
- 增加串口占用、驱动缺失、SIM PIN、天线未接等明确错误状态。

### P1：Windows 原生网络能力

- 读取 Windows Mobile Broadband / MBIM 状态。
- 展示真实数据连接、APN、IPv4/IPv6 地址和流量统计。
- 提供模块重置、网络重连和运营商扫描的安全状态机。

### P2：通话与短信

- 来电检测、号码展示、接听/拒接。
- USB Audio 或厂商音频通道路由。
- 分段短信重组、发送回执和可搜索历史记录。

### P3：发布质量

- 代码签名安装包和自动更新。
- 可选的本地崩溃报告，默认不上传设备标识。
- 更多语言、无障碍和高 DPI 测试。

## 许可边界

VoCat 仓库当前使用自定义 Research & Evaluation License，并非允许任意商用或任意地区部署的常规宽松开源许可证。VoLink 使用 MIT License，因此不能把 VoCat 源码、资源或受限实现直接并入 VoLink。本文提出的是基于公开功能说明的独立产品设计和重新实现。

参考：

- [VoCat 中文说明](https://github.com/MengMengCode/VoCat/blob/master/docs/README.zh-CN.md)
- [VoCat License](https://github.com/MengMengCode/VoCat/blob/master/LICENSE)
