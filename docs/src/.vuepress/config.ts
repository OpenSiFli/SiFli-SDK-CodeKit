import { defineUserConfig } from "vuepress";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/projects/codekit/",

  locales: {
    "/en/": {
      lang: "en-US",
      title: "sifli-sdk-codekit Application Manual",
      description: "sifli-sdk-codekit Application Manual",
    },
    "/": {
      lang: "zh-CN",
      title: "SiFli-SDK-CodeKit应用手册",
      description: "SiFli-SDK-CodeKit应用手册",
    },
  },

  theme,

  head: [
    [
      'script',
      {},
      `
      var _hmt = _hmt || [];
      (function() {
        var hm = document.createElement(\"script\");
        hm.src = \"https://hm.baidu.com/hm.js?b12a52eecef6bedee8b8e2d510346a6e\";
        var s = document.getElementsByTagName(\"script\")[0]; 
        s.parentNode.insertBefore(hm, s);
      })();
      `
    ]
  ],
  // Enable it with pwa
  // shouldPrefetch: false,
});
