'use strict';
/**
 * 服务端密钥配置模板（提交到 GitHub 的版本）
 *
 * 方式一：设置环境变量（推荐，Vercel / Render / 云服务器都支持）
 *   MODELSCOPE_TOKEN=ms-xxx
 *   ZHIPU_API_KEY=xxx.xxx
 *   ACCESS_CODE=你自己的访问口令
 *
 * 方式二：复制本文件为 secrets.local.js 并在 server.js 里改 require('./secrets.local')
 *        （记得把 secrets.local.js 加入 .gitignore，绝不提交真实密钥）
 */
module.exports = {
  MODELSCOPE_TOKEN: process.env.MODELSCOPE_TOKEN || '',
  ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
  ACCESS_CODE: process.env.ACCESS_CODE || 'change-me-2026',
};
