#!/bin/bash
set -e

VENV_DIR=".venv/docs"

setup_venv() {
  echo "Setting up docs environment..."
  python3 -m venv "$VENV_DIR"
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip -q
  pip install -r requirements-docs.txt -q
  echo "Setup complete."
}

if [ ! -d "$VENV_DIR" ]; then
  setup_venv
else
  source "$VENV_DIR/bin/activate"
  python -c "import mkdocs" 2>/dev/null || setup_venv
fi

mkdocs serve
