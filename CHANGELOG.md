# Changelog

## 1.1.2 — 2026-10-28

### 重要修复

- “移动数据”不再使用 `AT+CGATT=0`，避免 EM7430 脱离运营商网络并丢失信号
- Windows 模块优先连接/断开 Mobile Broadband（WWAN）数据会话，同时保持 `CGATT=1`、LTE 注册、短信和语音能力
- 非 Windows WWAN 模块使用 `AT+CGACT` 控制 PDP 上下文，不关闭蜂窝射频
- 自动识别本机 WWAN 接口及真实连接状态，界面分别显示“网络附着”和“移动数据”

## 1.1.1 — 2026-10-28

### 修复

- 通过 `AT+CNUM` 自动读取并显示 SIM 本机号码，未写入号码的 SIM 可在设备配置中手动补录
- 正确解码 Sierra 模组返回的十六进制 ASCII、UCS2 中文、数字和多行短信
- 自动合并同一长短信的连续存储片段，并在删除时清理全部片段
- 短信同步后恢复 GSM 字符集，避免运营商名称显示为 UCS2 编码

### 新增

- 独立的“移动数据”开关，使用 `AT+CGATT=0/1` 控制分组数据，不再借用飞行模式
- 短信收发方向、状态和长短信合并段数标识

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
