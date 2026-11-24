# 雷音禅拍 · 身心自愈全能创作平台

> 禅为根 · 拍为用 · 生活为体 · 国学为魂

一个独立的 AI 内容创作工作台，为「雷音禅拍 / 黄帝内经古法拍打」垂直领域设计。
支持小红书图文、视频号文案、口播稿、海报短句、禅意诗词、拍摄脚本等多种内容，
内置三大知识库（黄帝内经经络 / 雷音禅拍古法 / 道德经周易禅修），
勾选文化维度后自动检索并柔和融入文案。

## 本地运行

```bash
# 1. 配置密钥（环境变量）
export MODELSCOPE_TOKEN="ms-你的令牌"
export ZHIPU_API_KEY="智谱的KEY"
export ACCESS_CODE="你自己的访问口令"
# Windows PowerShell:
# $env:MODELSCOPE_TOKEN="ms-..."; $env:ZHIPU_API_KEY="..."; $env:ACCESS_CODE="..."

# 2. 启动
node server.js
# 打开 http://127.0.0.1:3000
```

零第三方依赖，Node 18+ 即可。

## 部署到任意云平台

本项目是标准 Node HTTP 服务，监听 `PORT` 环境变量、绑定 `0.0.0.0`，
可直接部署到 Vercel / Render / Railway / 阿里云 / 腾讯云 / 自购服务器。

- **Render / Railway**：新建 Web Service，指向本仓库，`npm start` 启动，
  在控制台填三个环境变量即可。
- **自有服务器**：`PORT=3000 node server.js`，前面挂 Nginx 反代。
- **Docker**（可选）：任意 node:18 基础镜像，`CMD ["node","server.js"]`。

## 安全说明

- 令牌只存在服务端，**绝不下发到浏览器**；浏览器只保存访问口令（localStorage）。
- 访问口令用于防止令牌被当公共代理滥用。请务必改成你自己的口令。
- 智谱 / 魔搭免费额度有限，请勿公开分享链接。

## 目录

```
.
├── server.js          # HTTP 服务 + 访问口令门禁 + 静态托管
├── llm.js             # 双引擎（魔搭 / 智谱）+ 自动回退
├── secrets.js         # 密钥读取（环境变量，模板已提交）
├── shared/            # 知识库 + 下拉配置 + prompt 引擎
└── web/               # 前端工作台
```

## 内容安全

内置合规底线：不玄学神化、不做医疗承诺、保留拍打禁忌提示
（孕产 / 出血倾向 / 严重慢病 / 皮肤破损）、儿童老人手法轻柔、只给场景不给判决。
