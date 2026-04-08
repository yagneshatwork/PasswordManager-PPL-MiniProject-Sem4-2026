# Java Web Password Manager

A secure, web-based password manager featuring a lightweight Java HTTP server backend and a responsive, modern HTML/CSS/JS frontend.

## Overview

This project provides a self-hosted password management solution. It securely stores credentials in an AES-256 GCM encrypted vault. The backend is written in pure Java without external dependencies, wrapping core encryption (AES-256 GCM) and key derivation (PBKDF2 with HMAC-SHA256) logic into a built-in `HttpServer`. The frontend offers a sleek, dark-mode user interface for managing saved credentials and generating strong passwords.

## Features

- **Secure Storage**: Credentials are encrypted using AES-256 in GCM mode.
- **Strong Key Derivation**: Master passwords are run through PBKDF2 with HMAC-SHA256 (310,000 iterations) and a 16-byte random salt to generate the 256-bit AES key.
- **Stand-alone Server**: The backend leverages `com.sun.net.httpserver.HttpServer` to serve both static files and the REST API. No external frameworks (like Spring or Tomcat) are required!
- **Modern UI**: A responsive, dark-mode web application (HTML/CSS/JS) to interact with your vault seamlessly.
- **Password Generator**: Built-in utility to generate highly secure, random passwords.
- **Auto-Save Mechanism**: Vault automatically saves upon adding or deleting new entries.

## Project Structure

```text
PasswordManager/
├── app.js                          # Client-side JavaScript logic (API calls, UI handling)
├── index.html                      # Main web interface
├── PasswordManagerServer.java      # Java HTTP Server and encryption backend
├── style.css                       # Stylesheets (Vanilla CSS, dark-mode theme)
├── vault.enc                       # Encrypted database (created on first run)
└── README.md                       # This documentation
```

## Getting Started

### Prerequisites

- Java Development Kit (JDK) 17 or higher.

### Running the App

1. **Compile the server**:
   Open a terminal in the project directory and run:
   ```bash
   javac PasswordManagerServer.java
   ```

2. **Start the server**:
   ```bash
   java PasswordManagerServer
   ```

3. **Access the application**:
   Open your preferred web browser and navigate to:
   ```
   http://localhost:8080
   ```

### First Use Configuration

1. On your first visit, you will be prompted for a Master Password. 
2. Entering a password creates your encrypted `vault.enc` file. **Do not lose this password!** It cannot be recovered.
3. Once logged in, you can start adding new credentials or generating strong passwords.

## API Endpoints

The server exposes the following RESTful API endpoints:

- `GET /api/status`: Check if the vault is unlocked and exists.
- `POST /api/auth`: Authenticate or create a new vault.
- `GET /api/credentials`: Retrieve the list of stored credentials.
- `POST /api/credentials`: Add a new credential.
- `DELETE /api/credentials`: Delete a credential.
- `POST /api/generate`: Generate a random secure password based on specified parameters.
- `POST /api/save`: Manually triggers a save of the current in-memory vault.
- `POST /api/logout`: Locks the vault, clears memory, and ends the session.

## Security Considerations

Since this application uses basic HTTP locally, ensure that you only run and access it on trusted, secure local environments. For remote deployment, configuring a reverse proxy (like Nginx) with HTTPS/TLS is strictly required to prevent the exposure of your master password and vault data.