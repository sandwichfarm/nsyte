// Platform detection and installation tabs functionality
document.addEventListener("DOMContentLoaded", function () {
  // Platform detection
  function detectPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    // Check for macOS
    if (platform.includes("mac") || userAgent.includes("macintosh")) {
      return "macos";
    }

    // Check for Windows
    if (platform.includes("win") || userAgent.includes("windows")) {
      return "windows";
    }

    // Check for specific Linux distributions
    if (userAgent.includes("arch")) {
      return "arch";
    }

    if (userAgent.includes("ubuntu") || userAgent.includes("debian")) {
      return "debian";
    }

    // Check for Linux generally
    if (platform.includes("linux") || userAgent.includes("linux")) {
      return "flatpak"; // Default to Flatpak for generic Linux
    }

    // Default fallback
    return "deno";
  }

  // Initialize tabs
  function initializeTabs() {
    const tabsContainer = document.querySelector("[data-tabs]");
    if (!tabsContainer) return;

    const tabButtons = tabsContainer.querySelectorAll(".tab-button");
    const tabPanes = tabsContainer.querySelectorAll(".tab-pane");

    // Detect platform and set active tab
    const detectedPlatform = detectPlatform();
    let activeTab = detectedPlatform;

    // Check if detected platform tab exists
    const detectedTabButton = tabsContainer.querySelector(`[data-tab="${detectedPlatform}"]`);
    if (!detectedTabButton) {
      activeTab = "deno"; // Fallback to universal
    }

    // Set initial active tab
    setActiveTab(activeTab);

    // Add click event listeners
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");
        setActiveTab(tabId);
      });
    });

    function setActiveTab(tabId) {
      // Remove active class from all buttons and panes
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabPanes.forEach((pane) => pane.classList.remove("active"));

      // Add active class to selected button and pane
      const activeButton = tabsContainer.querySelector(`[data-tab="${tabId}"]`);
      const activePane = tabsContainer.querySelector(`.tab-pane[data-tab="${tabId}"]`);

      if (activeButton && activePane) {
        activeButton.classList.add("active");
        activePane.classList.add("active");
      }
    }
  }

  // Copy to clipboard functionality
  function initializeCopyButtons() {
    const copyButtons = document.querySelectorAll(".copy-btn");

    copyButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const textToCopy = button.getAttribute("data-copy");

        try {
          await navigator.clipboard.writeText(textToCopy);

          // Visual feedback
          const originalText = button.textContent;
          button.textContent = "✅";
          button.classList.add("copied");

          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy text: ", err);

          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = textToCopy;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);

          // Visual feedback
          const originalText = button.textContent;
          button.textContent = "✅";
          button.classList.add("copied");

          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove("copied");
          }, 2000);
        }
      });
    });
  }

  // Smooth scrolling for anchor links
  function initializeSmoothScrolling() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');

    anchorLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        const targetId = link.getAttribute("href").substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    });
  }

  // Analytics for platform detection (optional)
  function trackPlatformDetection() {
    const detectedPlatform = detectPlatform();

    // Only track if analytics is available and user hasn't opted out
    if (typeof gtag !== "undefined") {
      gtag("event", "platform_detected", {
        "custom_parameter": detectedPlatform,
      });
    }

    // Console log for debugging
    console.log("Detected platform:", detectedPlatform);
  }

  // Initialize all functionality
  initializeTabs();
  initializeCopyButtons();
  initializeSmoothScrolling();
  trackPlatformDetection();

  // Add keyboard navigation for tabs
  document.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("tab-button")) {
      const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
      const currentIndex = tabButtons.indexOf(e.target);

      let nextIndex = currentIndex;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabButtons.length - 1;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = currentIndex < tabButtons.length - 1 ? currentIndex + 1 : 0;
        e.preventDefault();
      }

      if (nextIndex !== currentIndex) {
        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      }
    }
  });
});

// Export functions for potential external use
window.nsyteUtils = {
  detectPlatform: function () {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (platform.includes("mac") || userAgent.includes("macintosh")) {
      return "macos";
    }

    if (platform.includes("win") || userAgent.includes("windows")) {
      return "windows";
    }

    if (userAgent.includes("arch")) {
      return "arch";
    }

    if (userAgent.includes("ubuntu") || userAgent.includes("debian")) {
      return "debian";
    }

    if (platform.includes("linux") || userAgent.includes("linux")) {
      return "flatpak";
    }

    return "deno";
  },
};
