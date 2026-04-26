const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_API_PROXY_TARGET || 'https://lahacksbackend-production.up.railway.app',
      changeOrigin: true,
    })
  );
};
