# 专属邮箱取码

在现有 Cloud Mail 邮箱之上增加独立分享入口。收件人只收到这份授权对应的验证码，邮箱仍由原用户管理。

## 使用

管理员打开 `/admin`，输入独立管理口令。填写已有邮箱、备注和有效期（1 / 7 / 30 / 90 天），创建分享链接及随机访问口令。口令仅在创建时返回，服务器只保存哈希。分享人将链接和访问口令交给接收者，接收者无需安装扩展。

接收者打开 `/s/<grant-id>`，输入访问口令，点击刷新或等待新验证码。只展示授权创建后收到的最近 5 封未删除收件的高置信度验证码、发件人和北京时间，不开放原始正文、附件、主题、删除或发送邮件。等待最长 2 分钟，前 30 秒每 5 秒、30–60 秒每 10 秒、之后每 15 秒检查一次；进入后台停止。

管理员撤销授权后，下一次请求会被拒绝，包括已经登录的会话。过期授权不能重新登录。重新创建授权会产生新链接、口令和新邮件边界。已被接收者复制走的验证码无法通过撤销收回。

## 权限与数据

- `MAIL_DB`：绑定现有 Cloud Mail D1。应用代码只执行 SELECT；不会变更账号、邮件归属、邮件或附件。平台绑定本身不是数据库级只读权限，隔离由受测代码和管理口令实现。
- `SHARE_DB`：独立的小数据库，仅保存授权地址、备注、口令哈希、有效期、最新邮件 ID 边界、撤销状态和查询预算。
- `ADMIN_KEY`：独立随机管理口令，以 Cloudflare Secret 保存。没有复用 Cloud Mail 全站开放 API Token。
- `SESSION_SECRET`：仅用于签署取码会话。Cookie 为 `HttpOnly; Secure; SameSite=Strict`，最长 15 分钟；每次查询重新检查撤销和过期状态。
- `/api/codes` 从签名会话找到授权邮箱，不接受客户端收件地址或查询参数。通过完整地址等值过滤，并只读取授权边界之后的邮件。
- Cookie 登录和管理写入请求核对同源 Origin。API 与页面设置 no-store、无第三方脚本、CSP 和 no-referrer；权限信息不写浏览器持久化存储。
- 本地部署配置、真实口令及交付文件位于 gitignore 路径，不进入源码仓库。

分享链接和口令共同代表访问权。拿到二者的人可以获取这个邮箱新邮件中的验证码；多个人共用同一邮箱时，新邮件不会按人分隔，应使用不同邮箱区分。

## 免费额度保护

每份授权至少间隔 5 秒才执行邮件查询，按北京时间每日最多 500 次。额度在独立授权库内用原子 UPDATE 计数，超过时不读取邮件库。登录和管理请求使用 Workers Rate Limiting binding，每个限流键每分钟 10 次（按 Cloudflare 边缘位置计数，不是全局计数）。

邮件库查询沿用 `idx_email_to_email_type_is_del_id` 地址索引。正文在 SQL 中截取到 12,000 字符，最多 5 封，不调用 Workers AI；静态文件由 Workers Static Assets 提供，没有常驻任务或新增付费服务。所有用量仍受同一 Cloudflare 账号的总体额度约束。

## 部署

Node 24+，Wrangler 4.148.0 或兼容版本。

1. 复制 `wrangler.json` 为 `wrangler.local.json`，填写正确账号、MAIL_DB 和独立 SHARE_DB ID；设置可分享的域名列表。
2. 在 SHARE_DB 执行 `schema.sql`，不要在生产邮件数据库执行。
3. `node code-share/scripts/credentials.js` 生成 owner-only 的本地密钥文件。
4. `wrangler deploy --config code-share/wrangler.local.json` 部署，未配置 Secret 时接口保持关闭。
5. `wrangler secret bulk code-share/private/secrets.local.json --config code-share/wrangler.local.json` 上传 Secret。
6. 在管理页创建授权，或执行 `node code-share/scripts/credentials.js create https://your-host.example mailbox@example.com`，交付文件会保存在被忽略的 `private/`。

可以在本地部署配置中增加 custom-domain route。更换对外域名不需要重新创建授权，`credentials.js origin https://your-host.example` 更新本机交付文件。

## 验证

```sh
npm test
npm run check:share
npm run preview:share
wrangler deploy --config code-share/wrangler.json --dry-run
```

模拟页面为 `http://127.0.0.1:4174/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`，口令 `demo-access-only`。所有数据在内存 SQLite，模拟页面不会连接生产服务；模拟管理口令仅用于开发。

`tests/worker.test.js` 使用真实 SQLite 验证数据库条件、历史排除、邮箱隔离、登录 Cookie、撤销、过期、请求边界、限流、预算和最小返回字段。线上验收不向原邮件库写入测试邮件。
