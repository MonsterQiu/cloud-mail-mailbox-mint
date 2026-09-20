# Cloud Mail 邮箱铸造台

Chrome Manifest V3 扩展，面向 maillab/cloud-mail（已核对 MonsterQiu/cloud-mail 的开放 API）。一键生成随机邮箱名和强密码，创建独立用户，并在本地留存凭证。

## v1.0.5 北京时间显示

- D1 的 `CURRENT_TIMESTAMP` 是 UTC；插件继续使用 UTC 做验证码新鲜度判断，不改变服务端邮件数据。
- 收件码列表将时间明确转换为 `Asia/Shanghai`，显示为 `09/20 20:00 北京时间`，不再受浏览器或操作系统时区影响。
- 带 `Z` 或明确偏移量的 ISO 时间按原时区解析，不会重复增加 8 小时；无效时间显示“时间未知”。

## v1.0.4 免费额度优化

- 线上 D1 `email` 表已增加复合索引 `idx_email_to_email_type_is_del_id`，覆盖 `to_email COLLATE NOCASE, type, is_del, email_id DESC`。实际查询计划已从 `SCAN email` 变为 `SEARCH email USING COVERING INDEX`。
- “等待收件码”启动时先记录现有最新邮件 ID，只显示随后收到的新邮件；30 秒内每 5 秒检查，30–60 秒每 10 秒，之后每 15 秒，最长 2 分钟。完整等待从约 25 次请求降低到约 14 次。
- 收件查询从最近 10 封降到最近 5 封，验证码用途足够，同时减少正文传输和 Worker 序列化。
- 邮件显示新鲜度：刚刚收到、若干分钟前、可能已失效。开始等待前 30 秒内刚到达的验证码仍会识别，避免基线查询竞争。
- 创建页新增“创建并等待验证码”，成功后自动切到收件码、选择刚创建邮箱并建立新邮件基线。
- 未增加后台常驻轮询和通知权限；个人使用时只有弹窗保持打开才查询，避免不必要消耗。

索引迁移保存在 `migrations/001-email-inbox-index.sql`。它已应用到当前线上 D1；新环境部署时也应执行一次。

## v1.0.3 收件码

弹窗新增“收件码”标签：从本地创建记录选择邮箱或手动输入当前配置域名的完整地址，可立即查询，也可逐步降频查询、最长等待 2 分钟。收到邮件后，本地从主题和正文提取 4–8 位数字或字母数字验证码，点击候选码即可复制。关闭弹窗或切换标签会停止等待。

查询固定使用 `/api/public/emailList` 的精确 `toEmail`、`type:0`、`isDel:0`、倒序和最多 5 封邮件。当前服务端开放接口没有返回数据库中的 `code` 字段，因此扩展执行本地候选提取；会降低年份、电话、金额和订单号的优先级，但无法保证每封非标准邮件都准确。未识别时仍显示发件人、主题、时间和有长度上限的纯文本摘要供人工判断。

原始邮件正文、摘要和验证码不保存到创建记录，不新增 Chrome 权限。API Token 本身可查询全站邮件，仍应只在自己的电脑使用。

## v1.0.2 随机邮箱名模板

每次新生成邮箱名，使用 Web Crypto 在 A、B、C、E 中等概率抽取一种，各约 25%，允许连续抽到同一种：

- A：简短昵称＋2–4 位数字，例如 `milo728`。
- B：名字＋姓氏首字母＋2–4 位数字，例如 `adrianw62`。
- C：可读的随机昵称，由音节组合，不带数字，例如 `velorin`。
- E：名字．另一段名字，例如 `milo.arden`。

首次生成、「换一组」、邮箱名旁的刷新、创建后「生成下一组」均使用同一套随机选择。重新打开已有草稿仍保留原邮箱名和密码；只刷新密码不会改变邮箱名。旧记录保留原样，不进行重命名。点号已被校验器支持，但不能连续或位于首尾。随机名称不保证服务端未被占用，重复时可换一组。

## 界面修复与更新

修复真实 Chrome 弹窗在自动测量时被 `max-width:100vw` 挤窄的问题：html/body 明确为 420 × 560，导航固定，内容区独立滚动。未配置时只显示连接引导；已配置时全部创建表单与按钮首屏可见。简化标题、压缩空白，设置按钮增加文字，记录按卡片显示。

如果您已经安装过：**不要移除扩展**。将新版文件覆盖到原来加载的同一个文件夹，然后在 `chrome://extensions` 中点击本扩展的刷新/重新加载按钮。原路径更新会保留 Token 和本地记录。界面右下角 `v1.0.5` 表示已加载新版。若原来加载的就是本项目 `dist/cloud-mail-mailbox-mint`，该目录已经更新，直接刷新即可。

## 安装与连接

1. 打开 Chrome，在地址栏输入 `chrome://extensions`。
2. 打开右上角「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择 `dist/cloud-mail-mailbox-mint` 文件夹（里面应直接有 manifest.json）。也可解压 ZIP 后选择其根目录。
4. 在浏览器扩展菜单中固定「Cloud Mail 邮箱铸造台」，打开它并点击设置。
5. 站点默认 `https://webmail.sisyphusx.com`。填写该站点的**开放 API Token**（非网页登录 JWT，不加 Bearer），点击「保存并测试连接」。
6. 没有 Token 时，展开「用管理员账号生成」。生成操作会替换站点旧全局 Token；管理员密码仅在本次请求中使用，表单随后清空。
7. 测试成功后可以使用检测到的域名，选择默认域名并保存。角色留空使用服务端默认角色，确保它是普通用户。
8. 点击扩展图标 →「创建邮箱并保存凭证」。名称和密码已随机生成，也可以单独刷新。
9. 需要验证码时打开“收件码”，选择邮箱后点击“等待收件码”；保持弹窗打开，识别到验证码后点击即可复制。

**不会自动替您配置 Token、创建真实邮箱或修改 Cloudflare。** 安装包没有账号、密码或 Token。新账号能否收件，仍取决于原 Cloud Mail 的域名路由、角色和收件设置。

## 记录与导出

- 「创建记录」可搜索、显示密码、复制邮箱/密码/全部、单条删除、清空。
- 删除的是本机凭证，服务器邮箱不受影响。卸载扩展或清理 Chrome 配置文件会删除记录。
- 默认密码保存在 `chrome.storage.local`，不使用 Sync。它是**本机明文存储**，不是加密保险库。
- 关闭「保存密码」会同时清除历史记录中的密码。当前生成的密码仅留在 `chrome.storage.session`，浏览器关闭、扩展重载后可能丢失。
- CSV 导出含 UTF-8 BOM，带 Excel 公式保护，部分以 `= + - @` 开头的值会添加单引号。**需要逐字节还原密码请使用 JSON 备份或复制按钮**。导出文件也包含密码。
- 记录上限 5000 条，到达上限会提示导出清理，不会悄悄丢弃旧记录。
- 「待核对」意味着超时、服务中断或后台异常终止：服务器可能已创建账号。原凭证会保留，请去后台确认，扩展不会自动重试这次操作。

## API 契约与边界

- `POST /api/public/addUser`：`Authorization: TOKEN`，请求体 `{ "list": [{ "email": "...", "password": "...", "roleName": "可选" }] }`。
- 成功必须同时满足 HTTP 成功和 JSON `code === 200`。HTTP 200 中的 `code: 401` 仍是失败。
- 连接测试使用 `addUser` 的空 `list`，该版本服务端直接返回，不写用户表。检测域名使用 `GET /api/setting/websiteConfig`。
- `POST /api/public/genToken`：只在设置页明确确认后调用；管理员邮箱/密码通过 HTTPS 发送至用户配置的站点。
- Token 是服务端全局令牌，权限包含批量创建及查询邮件。不要发给别人，也不要混用登录 JWT。
- 服务端未知角色名可能回退到默认角色。扩展不猜测角色权限；请先核对后台默认角色。
- 创建的是独立用户，不是现有账号的子邮箱；已有地址不能重复使用。

## 架构

弹窗 / 设置页 → 内部消息 → 后台 Service Worker → Cloud Mail HTTPS API。

后台验证来源页面、域名、邮箱名、密码和站点授权，读取 Token 并串行写入存储。请求前先保存 pending 凭证，请求结束更新 created / failed / uncertain。后台重启遇到 pending 会标记 uncertain。相同请求 ID 成功后不重复提交；同时的创建请求被拒绝。

- `lib/controller.js`：创建生命周期、持久化、重复提交控制、配置变更。
- `lib/api.js`：18 秒超时、业务状态解析、禁止重定向、无 Cookie、敏感值错误脱敏。
- `lib/generator.js`：Web Crypto、四种邮箱名模板、拒绝采样、密码分组约束、均匀洗牌。
- `lib/code-extractor.js`：邮件纯文本化、验证码候选评分、去重和有界摘要。
- `background/service-worker.js`：仅接受本扩展的两个 UI 页发出的消息。
- `chrome.storage.local`：站点配置、Token、记录；`session`：当前草稿。存储限制到可信扩展上下文。
- 无 content script、外部消息入口、浏览历史权限、标签页读取、远程脚本和遥测。更换站点不会沿用旧 Token。可选站点权限仅在设置页用户操作时申请。

## 开发与验证

需要 Node 24+；无 npm 依赖、无需安装依赖。

```sh
npm test
node scripts/icons.js
npm run check
npm run package
npm run preview
```

预览地址：`http://127.0.0.1:4173/`。预览使用本地模拟接口和 `example.test`，不会连接真实邮箱服务。模拟 Token 为 `demo-token`；邮箱名前缀 `taken` 模拟重复，`timeout` 模拟不确定结果。仅开发预览加载 mock；它们不在安装包中。点击「设置」可查看配置页。

自动测试覆盖随机生成约束、输入校验、跨站 Token 隔离、HTTP/业务错误、超时、请求前持久化、关闭后恢复、并发重复提交、存储失败、关闭密码留存、验证码提取、精确收件查询和 CSV 转义。UI 实际验证结果见源码目录 `QA.md`。

打包脚本使用 macOS 的 `/usr/bin/zip`，生成 ZIP 和可直接加载的文件夹。PNG 图标从项目内的信封造型确定性生成。打包白名单不会包含测试、演示、.git 或本地记录。

## 参考

- [Cloud Mail 原项目](https://github.com/maillab/cloud-mail)
- [核对的接口实现](https://github.com/MonsterQiu/cloud-mail/blob/a6b66fc6576def10db6c9d8b53c8a3931e822112/mail-worker/src/service/public-service.js)
- [Chrome 扩展跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

这是个人工具，未上架 Chrome 应用商店。无需替换原邮箱项目，也无需额外部署 Worker。
