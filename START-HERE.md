# Behind the Prompt — Gemini 免费额度演示版

代码已切换为 Google Gemini API；需要你自己的免费项目密钥，尚未实际调用你的账号。六屏、全部素材、图片本机调光及收据导出保留。Node.js 已安装，不用重装。

## 先了解适用范围

免费 Gemini API 支持生成真实回答及连续对话，但免费条款允许 Google 使用输入和输出改进产品，并可能由人工审阅。官方要求不要提交个人、敏感或机密信息。本版因此适合 18 岁以上用户用一般问题或虚构情境测试，不适合让朋友输入真实私密问题。仅仅去掉姓名也不保证内容符合要求。

页面在发送前要求确认这些条件；收据同步记录免费数据使用规则。此确认不能替代遵守条款，也不能自动判断输入是否含隐私。

澳洲在支持地区内；免费方案有额度和模型限制，以自己的 AI Studio 项目显示为准。默认模型 gemini-3.5-flash-lite。不要绑定计费、开通付费升级或订阅会员来完成这一版测试。

## 现在的安装步骤

1. 解压 ZIP，VS Code → File → Open Folder，打开 Behind-the-prompt-Gemini 文件夹。
2. 展开 backend，将 .env.example 的内容复制到新建的 .env 文件。
3. 打开 https://aistudio.google.com/ ，使用自己的 Google 账号登录。
4. 进入 API keys 页面，在免费、未启用计费的项目中创建 API key。密钥只粘贴到本机 backend/.env 的 GEMINI_API_KEY= 后面，不要截图给别人。
5. 第一行换成自己的密钥；其余行保留：

```text
GEMINI_API_KEY=这里替换成自己的密钥
GEMINI_MODEL=gemini-3.5-flash-lite
ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
PORT=8787
MAX_DAILY_REQUESTS=100
```

不要使用上面的中文作为实际密钥，也不要沿用旧的 ANTHROPIC_API_KEY/GROQ_API_KEY。这份后台只读 GEMINI_API_KEY。

6. VS Code → Terminal → New Terminal，在项目根目录运行：

```sh
cd backend
npm start
```

7. 这个终端保持运行。前端右键 index.html → Open with Live Server。
8. 点击开始，在第二屏输入例如：Write a short fictional dialogue about asking a friend for advice.
9. 阅读并勾选发送确认，点击 Send to AI。回复后再提问，测试是否能理解上下文。

不要发送真实个人经历、机密文件或个人身份信息。Alex 的离线例子不调用 Google，开始自己的 AI 对话时会替换 Alex 的脚本。

## 功能说明

- 真实请求：当前聊天文字及之前的回复，经后台发往 Google。
- 本机操作：图片选择、预览、亮度处理、PNG 收据生成。照片不会包含在 AI 请求里。
- 虚构情境：分享链接、转发、搜索发现及广告使用；不会实际发布或转发用户内容。
- 请求失败可重试；重试可能再次发送历史。收据区别后端确认转发、未转发、不确定请求及收到的回复。
- 清除对话不会清除本次体验的请求计数，也不代表删除 Google 已收到的数据。
- 重新开始只清空本地体验；收据不验证 Google 的真实存储行为，不自动设置服务商隐私控制。

## 发布记录（后续再做）

GitHub Pages 托管前端；后端需要另一处 Node.js 服务或在测试时运行于本机。
上线后把 config.js 中的 apiBase 改成后端 HTTPS 地址，后端 ALLOWED_ORIGINS 改成前端网站的 origin（不要包含仓库路径）。密钥只放后端环境变量。

.env 已在 .gitignore 中排除，禁止上传到 GitHub。免费 API 不保证后端托管套餐免费；选择托管时另行核查。Gemini 免费 API 有地区和年龄要求，本版先限于澳洲、18 岁以上的小范围课堂测试。对外发布前需核查目标地区及受众是否符合条款。

本后台单进程每日上限和每分钟/每小时限制会在重启后重置，不能替代服务商配额或共享认证，不适合直接大规模开放。

## 已完成的验证及限制

8 项后台自动测试通过，包括历史格式转换、空/被拦截回复、密钥缺失、来源限制、同意确认、服务商及网络失败、额度控制；前端状态测试与语法检查通过。没有实际密钥，未测试真实 Gemini 回答。当前环境没有可用浏览器，尚未完成视觉及完整点击验收。

## 官方来源（2026-10-06 核查）

- 免费定价：https://ai.google.dev/gemini-api/docs/pricing
- 免费数据使用条款：https://ai.google.dev/gemini-api/terms
- 支持地区：https://ai.google.dev/gemini-api/docs/available-regions
- API 密钥：https://ai.google.dev/gemini-api/docs/api-key
- API 请求：https://ai.google.dev/api/generate-content
