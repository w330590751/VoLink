# Changelog

## 1.1.0 — 2026-08-13

### 新增

- RSRP、RSRQ、SINR、LTE 频段、信道和分组服务状态
- 一键设备诊断：AT 端口、SIM、射频、网络注册和数据附着
- GitHub Releases 在线更新检查和受限外链打开
- 真实模块离线时的明确警告，避免把缓存数据误认为实时数据

### 改进

- 针对 Sierra Wireless `AT!GSTATUS?` 和通用 `AT+CESQ` 的射频解析
- 长短信会话和日志列表使用延迟渲染，降低大列表页面开销
- 重写中文项目首页并加入与 VoCat 的独立分析和许可边界

## 1.0.0 — 2026-08-11

首个公开 Windows 4G/5G 模块控制中心版本。

### 主要功能

- 自动发现 Windows 调制解调器和 AT 串口
- SIM、信号、运营商、IMEI、IMSI、ICCID 和固件状态
- 直接拨号、挂断和本地通话记录
- 短信、AT 终端和 USSD
- 通过 lpac 管理 eSIM
- HTTP 和 SOCKS5 代理实例
- Telegram、飞书、QQ Bot、Bark、Email、PushPlus 和 Webhook 通知
- VoHive 风格设备工作台

### 已测试硬件

- Sierra Wireless EM7430（COM17）

### 下载说明

发布文件是未签名的 Windows x64 便携版，SmartScreen 可能显示未知发布者。语音音频和 eSIM 能力取决于模块固件及硬件。
