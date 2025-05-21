#!/bin/bash

# Create a virtual environment for documentation
python3 -m venv .venv/docs

# Activate the virtual environment
source .venv/docs/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install documentation dependencies
pip install -r requirements-docs.txt

# Create a convenience script to serve docs
cat > scripts/serve-docs.sh << 'EOF'
#!/bin/bash
source .venv/docs/bin/activate
mkdocs serve
EOF

# Create a convenience script to build docs
cat > scripts/build-docs.sh << 'EOF'
#!/bin/bash
source .venv/docs/bin/activate
mkdocs build
EOF

# Make scripts executable
chmod +x scripts/serve-docs.sh
chmod +x scripts/build-docs.sh

echo "Documentation environment setup complete!"
echo "To serve the documentation locally, run: ./scripts/serve-docs.sh"
echo "To build the documentation, run: ./scripts/build-docs.sh" 