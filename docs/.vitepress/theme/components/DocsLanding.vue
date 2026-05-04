<script setup lang="ts">
import { withBase } from "vitepress";

const sections = [
  {
    title: "Installation",
    text: "Install nsyte from the shell script, JSR, or a platform binary.",
    href: "/installation",
  },
  {
    title: "Usage",
    text: "Initialize a project, deploy a site, and manage published files.",
    href: "/usage/",
  },
  {
    title: "Commands",
    text: "Reference every CLI command, option, alias, and workflow.",
    href: "/usage/commands",
  },
  {
    title: "Guides",
    text: "Production deployment, CI/CD, local setup, and security practices.",
    href: "/guides/deployment",
  },
];
</script>

<template>
  <main class="docs-landing" aria-labelledby="docs-landing-title">
    <section class="docs-landing-hero">
      <div class="docs-landing-grid" aria-hidden="true"></div>
      <div class="docs-landing-inner">
        <p class="docs-landing-kicker">Documentation</p>
        <h1 id="docs-landing-title">nsyte</h1>
        <p class="docs-landing-tagline">Unstoppable publishing for the sovereign web</p>
        <div class="docs-landing-command" aria-label="Install command">
          <code>curl -fsSL https://nsyte.run/get/install.sh | bash</code>
        </div>
      </div>
    </section>

    <section class="docs-landing-sections" aria-label="Documentation sections">
      <a
        v-for="section in sections"
        :key="section.href"
        class="docs-landing-card"
        :href="withBase(section.href)"
      >
        <span>{{ section.title }}</span>
        <p>{{ section.text }}</p>
      </a>
    </section>
  </main>
</template>
