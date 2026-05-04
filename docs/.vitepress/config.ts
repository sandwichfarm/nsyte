import { defineConfig } from "vitepress";

export default defineConfig({
  title: "nsyte",
  description: "Documentation for nsyte - publish your site to nostr and blossom servers",
  base: "/docs/",
  outDir: "../dist/docs",
  cleanUrls: true,
  srcExclude: [
    "README.md",
    "JSR_SETUP.md",
    "overrides/**",
    "stylesheets/**",
    "javascripts/**",
  ],
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/assets/favicon.svg" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href:
          "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap",
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: "Home", link: "https://nsyte.run/" },
      { text: "Docs", link: "/" },
      { text: "Install", link: "/installation" },
      { text: "Commands", link: "/usage/commands" },
      { text: "Guides", link: "/guides/deployment" },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Documentation", link: "/" },
          { text: "Installation", link: "/installation" },
          { text: "Basic Usage", link: "/usage/" },
          { text: "Configuration", link: "/usage/configuration" },
          { text: "Command Overview", link: "/usage/commands" },
          { text: "Global Options", link: "/usage/commands/_global-options" },
        ],
      },
      {
        text: "Commands",
        collapsed: false,
        items: [
          { text: "announce", link: "/usage/commands/announce" },
          { text: "browse", link: "/usage/commands/browse" },
          { text: "bunker", link: "/usage/commands/bunker" },
          { text: "ci", link: "/usage/commands/ci" },
          { text: "config", link: "/usage/commands/config" },
          { text: "debug", link: "/usage/commands/debug" },
          { text: "delete", link: "/usage/commands/delete" },
          { text: "deploy", link: "/usage/commands/deploy" },
          { text: "download", link: "/usage/commands/download" },
          { text: "get", link: "/usage/commands/get" },
          { text: "init", link: "/usage/commands/init" },
          { text: "list", link: "/usage/commands/ls" },
          { text: "put", link: "/usage/commands/put" },
          { text: "run", link: "/usage/commands/run" },
          { text: "scan", link: "/usage/commands/scan" },
          { text: "serve", link: "/usage/commands/serve" },
          { text: "sites", link: "/usage/commands/sites" },
          { text: "snapshot", link: "/usage/commands/snapshot" },
          { text: "status", link: "/usage/commands/status" },
          { text: "undeploy", link: "/usage/commands/undeploy" },
          { text: "validate", link: "/usage/commands/validate" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Deployment", link: "/guides/deployment" },
          { text: "Security", link: "/guides/security" },
          { text: "Platform Security", link: "/guides/security-platforms" },
          { text: "Security Troubleshooting", link: "/guides/security-troubleshooting" },
          { text: "CI/CD", link: "/guides/ci-cd" },
          { text: "Local Setup", link: "/guides/local-setup" },
          { text: "NIP-89 App Handler", link: "/nip89-handler" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/sandwichfarm/nsyte" },
    ],
    footer: {
      message: "Published to the decentralized web with nsyte.",
      copyright: "MIT Licensed",
    },
  },
});
