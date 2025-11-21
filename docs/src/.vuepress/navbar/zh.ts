import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  "/",
  {
    text: "快速入门",
    icon: "lightbulb",
    link: "/get-started/",
  },
  {
    text: "故障排除",
    icon: "code",
    link: "/Troubleshooting/",
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
