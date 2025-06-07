class Nsyte < Formula
  desc "Command-line tool for publishing websites to nostr and Blossom servers"
  homepage "https://github.com/sandwichfarm/nsyte"
  url "https://github.com/sandwichfarm/nsyte/archive/v0.6.1.tar.gz"
  sha256 "PLACEHOLDER_SHA256" # Will be updated automatically
  license "MIT"
  head "https://github.com/sandwichfarm/nsyte.git", branch: "main"

  depends_on "deno"

  def install
    # Build the binary
    system "deno", "task", "compile"
    
    # Install the binary
    case OS.mac?
    when true
      bin.install "dist/nsyte-macos" => "nsyte"
    else
      bin.install "dist/nsyte-linux" => "nsyte"
    end

    # Create shell completions (if they exist)
    # generate_completions_from_executable(bin/"nsyte", "completions")
  end

  test do
    # Test that the binary runs and shows version
    assert_match version.to_s, shell_output("#{bin}/nsyte --version")
  end
end