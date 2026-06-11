class Nsyte < Formula
  desc "Publish your site to nostr and blossom servers"
  homepage "https://github.com/sandwichfarm/nsyte"
  license "MIT"
  version "PLACEHOLDER_VERSION"

  on_macos do
    on_arm do
      url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-macos-arm64-#{version}"
      sha256 "PLACEHOLDER_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-macos-x64-#{version}"
      sha256 "PLACEHOLDER_SHA256_MACOS_X64"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/sandwichfarm/nsyte/releases/download/v#{version}/nsyte-linux-#{version}"
      sha256 "PLACEHOLDER_SHA256_LINUX_X86_64"
    end
    # on_arm: Linux aarch64 binary not yet built - pending release.yml aarch64 build step
  end

  def install
    if OS.mac? && Hardware::CPU.arm?
      bin.install "nsyte-macos-arm64-#{version}" => "nsyte"
    elsif OS.mac?
      bin.install "nsyte-macos-x64-#{version}" => "nsyte"
    elsif Hardware::CPU.intel?
      bin.install "nsyte-linux-#{version}" => "nsyte"
    else
      odie "No prebuilt binary for this platform. See https://github.com/sandwichfarm/nsyte"
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/nsyte --version")
  end
end
