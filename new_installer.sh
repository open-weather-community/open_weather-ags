#!/bin/bash

# Variables
REPO_OWNER="prismspecs"
REPO_NAME="open_weather-ags"
INSTALL_DIR="$HOME/open_weather-ags"
RELEASE_API_URL="https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest"

# Function to print error messages and exit
function error_exit {
    echo "Error: $1" >&2
    exit 1
}

# Remove the folder if it exists
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing existing directory $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR" || error_exit "Failed to remove existing directory."
fi

# Fetch the latest release information from GitHub API
echo "Fetching the latest release information..."
RELEASE_INFO=$(curl -s "$RELEASE_API_URL") || error_exit "Failed to fetch release information."

# Extract the tag name and tarball URL
LATEST_RELEASE_TAG=$(echo "$RELEASE_INFO" | grep -oP '"tag_name":\s*"\K[^"]+')
DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -oP '"tarball_url":\s*"\K[^"]+')

if [ -z "$LATEST_RELEASE_TAG" ] || [ -z "$DOWNLOAD_URL" ]; then
    error_exit "Failed to retrieve the latest release details."
fi

echo "Latest release tag: $LATEST_RELEASE_TAG"
echo "Download URL: $DOWNLOAD_URL"

# Create the installation directory
mkdir -p "$INSTALL_DIR" || error_exit "Failed to create installation directory."

# Download and extract the latest release
echo "Downloading and extracting the latest release..."
TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory."

curl -L "$DOWNLOAD_URL" | tar xz -C "$TEMP_DIR" || error_exit "Failed to download or extract the tarball."

# Move extracted files to the installation directory
EXTRACTED_DIR=$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)

if [ -z "$EXTRACTED_DIR" ]; then
    rm -rf "$TEMP_DIR"
    error_exit "Failed to locate the extracted directory."
fi

mv "$EXTRACTED_DIR"/* "$INSTALL_DIR"/ || error_exit "Failed to move files to $INSTALL_DIR."

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo "Installation completed successfully at $INSTALL_DIR."
