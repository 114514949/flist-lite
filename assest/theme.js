/*
 * 首屏主题：在 CSS 生效前就把 data-theme 写到 <html> 上，
 * 避免深色用户看到一瞬白屏。真正的切换逻辑在 app.js 里。
 * 支持 ?theme=dark / ?theme=light 强制指定（方便分享与截图）。
 */
(function () {
  var KEY = 'flist-lite-theme';
  var forced = null;
  try {
    forced = new URLSearchParams(window.location.search).get('theme');
  } catch (error) {
    forced = null;
  }

  var theme = null;
  if (forced === 'dark' || forced === 'light') {
    theme = forced;
  }
  if (!theme) {
    try {
      theme = localStorage.getItem(KEY);
    } catch (error) {
      theme = null;
    }
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.dataset.theme = theme;
})();
