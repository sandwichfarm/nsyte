import DefaultTheme from "vitepress/theme";
import { nextTick, onMounted, watch } from "vue";
import { useRoute } from "vitepress";
import DocsLanding from "./components/DocsLanding.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("DocsLanding", DocsLanding);
  },
  setup() {
    const route = useRoute();

    const armCopyFeedbackReset = () => {
      document.querySelectorAll<HTMLButtonElement>("button.copy").forEach((button) => {
        if (button.dataset.nsyteCopyReset === "true") return;
        button.dataset.nsyteCopyReset = "true";
        button.addEventListener(
          "click",
          () => {
            setTimeout(() => {
              button.classList.remove("copied");
              button.blur();
            }, 1500);
          },
          { capture: true },
        );
      });
    };

    onMounted(armCopyFeedbackReset);
    watch(
      () => route.path,
      () => nextTick(armCopyFeedbackReset),
    );
  },
};
