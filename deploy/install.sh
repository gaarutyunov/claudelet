#!/bin/bash
set -e

# Claudelet Installation Script
# Run as root or with sudo

echo "=== Claudelet Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root or with sudo"
    exit 1
fi

# Create claudelet user if not exists
if ! id -u claudelet > /dev/null 2>&1; then
    echo "Creating claudelet user..."
    useradd -r -s /bin/false -d /var/lib/claudelet claudelet
fi

# Create directories
echo "Creating directories..."
mkdir -p /opt/claudelet
mkdir -p /var/lib/claudelet/{workspaces,claude-config}
mkdir -p /etc/claudelet

# Copy application files
echo "Copying application files..."
cp -r server /opt/claudelet/
cp -r web/dist /opt/claudelet/web/

# Set ownership
echo "Setting permissions..."
chown -R claudelet:claudelet /opt/claudelet
chown -R claudelet:claudelet /var/lib/claudelet

# Copy systemd service
echo "Installing systemd service..."
cp deploy/claudelet.service /etc/systemd/system/

# Copy example env if env doesn't exist
if [ ! -f /etc/claudelet/env ]; then
    echo "Creating environment file..."
    cp deploy/env.example /etc/claudelet/env
    chmod 600 /etc/claudelet/env
    echo "IMPORTANT: Edit /etc/claudelet/env with your settings"
fi

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /etc/claudelet/env with your configuration"
echo "2. Set up SSH keys for the claudelet user to access git repositories"
echo "3. Start the service: systemctl start claudelet"
echo "4. Enable on boot: systemctl enable claudelet"
echo "5. Check status: systemctl status claudelet"
echo ""
echo "For SSH key setup (as root):"
echo "  mkdir -p /var/lib/claudelet/.ssh"
echo "  ssh-keygen -t ed25519 -f /var/lib/claudelet/.ssh/id_ed25519 -N ''"
echo "  chown -R claudelet:claudelet /var/lib/claudelet/.ssh"
echo "  chmod 700 /var/lib/claudelet/.ssh"
echo "  chmod 600 /var/lib/claudelet/.ssh/id_ed25519"
echo ""
echo "Add the public key to your Gitea server:"
echo "  cat /var/lib/claudelet/.ssh/id_ed25519.pub"
