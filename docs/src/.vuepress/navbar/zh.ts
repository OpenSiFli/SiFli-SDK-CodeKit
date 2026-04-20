import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  "/",
  {
    text: "快速入门",
    icon: "lightbulb",
    link: "/get-started/",
  },
  {
    text: "硬件调试",
    icon: "code",
    link: "/debug/",
  },
  {
    text: "进阶功能",
    icon: "fa-solid fa-sitemap",
    link: "/Feature/",
  },
  {
    text: "常见问题",
    icon: "fa-solid fa-wrench",
    link: "/FAQs/",
  },
]);
